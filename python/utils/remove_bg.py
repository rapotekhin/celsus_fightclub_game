"""
Удаление фона из MP4 по чёткому контуру (FloodFill от краёв).

Установка: pip install opencv-python numpy

Запуск:
    python remove_bg.py --input sprite.mp4 --output out.webm
    python remove_bg.py --input sprite.mp4 --output out.webm --tolerance 15 --tolerance-max 40 --inner-holes --drop-outliers --drop-std 3
"""

import cv2
import numpy as np
import argparse
import os
import tempfile
import glob


def detect_bg_color(frame: np.ndarray, patch_size: int = 10) -> np.ndarray:
    """Среднее по квадрату patch_size x patch_size из левого верхнего и нижнего углов."""
    h, w = frame.shape[:2]
    p = patch_size
    patches = [
        frame[0:p,   0:p],  # верх-лево
        frame[h-p:h, 0:p],  # низ-лево
    ]
    all_pixels = np.concatenate([patch.reshape(-1, 3) for patch in patches], axis=0)
    return np.mean(all_pixels, axis=0).astype(np.uint8)


def floodfill_mask(frame: np.ndarray, bg_color: np.ndarray, tolerance: int) -> np.ndarray:
    """Флудфилл от левых углов. Возвращает маску фона (255=фон, 0=персонаж)."""
    h, w = frame.shape[:2]
    mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
    fill_img = frame.copy()
    for (x, y) in [(0, 0), (0, h - 1)]:
        if mask[y + 1, x + 1] == 0:
            cv2.floodFill(
                fill_img, mask,
                seedPoint=(x, y),
                newVal=bg_color.tolist(),
                loDiff=(tolerance,) * 4,
                upDiff=(tolerance,) * 4,
                flags=cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8),
            )
    return mask[1:-1, 1:-1]


def remove_background_frame(
    frame: np.ndarray,
    tolerance: int = 15,
    tolerance_max: int = 40,
    tolerance_step: int = 5,
    min_removed_ratio: float = 0.05,
    prev_removed_ratio: float = None,
    inner_holes: bool = False,
    inner_holes_min_area: int = 0,
    inner_holes_max_count: int = 0,
    halo_remove: int = 1,
) -> tuple:
    """
    Удаляет фон с адаптивным tolerance.
    Возвращает: (bgra_frame, bg_color, used_tolerance, removed_ratio)
    """
    h, w = frame.shape[:2]
    total_pixels = h * w
    bg_color = detect_bg_color(frame)

    used_tolerance = tolerance
    bg_mask = None
    removed_ratio = 0.0

    threshold = min_removed_ratio
    if prev_removed_ratio is not None:
        threshold = max(min_removed_ratio, prev_removed_ratio * 0.4)

    while used_tolerance <= tolerance_max:
        bg_mask = floodfill_mask(frame, bg_color, used_tolerance)
        removed_ratio = np.count_nonzero(bg_mask) / total_pixels
        if removed_ratio >= threshold:
            break
        used_tolerance += tolerance_step

    alpha = cv2.bitwise_not(bg_mask)

    if inner_holes:
        bg_color_match = np.all(
            np.abs(frame.astype(np.int16) - bg_color.astype(np.int16)) <= used_tolerance,
            axis=2,
        ).astype(np.uint8) * 255
        holes = cv2.bitwise_and(bg_color_match, alpha)

        # Всегда разбиваем на компоненты для фильтрации по количеству и размеру
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(holes, connectivity=8)

        # Собираем все области (label, area), сортируем по убыванию площади
        regions = sorted(
            [(label, stats[label, cv2.CC_STAT_AREA]) for label in range(1, num_labels)],
            key=lambda x: x[1], reverse=True
        )

        # Ограничиваем по количеству (берём top-N самых больших)
        if inner_holes_max_count > 0:
            regions = regions[:inner_holes_max_count]

        # Фильтруем по минимальной площади
        if inner_holes_min_area > 0:
            regions = [(lbl, area) for lbl, area in regions if area >= inner_holes_min_area]

        # Собираем финальную маску дыр
        filtered_holes = np.zeros_like(holes)
        for lbl, _ in regions:
            filtered_holes[labels == lbl] = 255
        holes = filtered_holes

        alpha = cv2.bitwise_and(alpha, cv2.bitwise_not(holes))

    if halo_remove > 0:
        kernel = np.ones((3, 3), np.uint8)
        alpha = cv2.erode(alpha, kernel, iterations=halo_remove)

    bgra = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
    bgra[:, :, 3] = alpha

    return bgra, bg_color, used_tolerance, removed_ratio


def process_video(
    input_path: str,
    output_path: str,
    tolerance: int = 15,
    tolerance_max: int = 40,
    inner_holes: bool = False,
    inner_holes_min_area: int = 0,
    inner_holes_max_count: int = 0,
    halo_remove: int = 1,
    drop_outliers: bool = False,
    drop_std: float = 3.0,
):
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"❌ Не могу открыть файл: {input_path}")
        return

    fps        = cap.get(cv2.CAP_PROP_FPS)
    width      = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"📹 Видео: {width}x{height}, {fps:.1f} fps, {total_frames} кадров")
    print(f"🎨 Tolerance: {tolerance}–{tolerance_max} (адаптивный)")
    print(f"🕳️  Inner holes: {'включён' if inner_holes else 'выключен'}" + (f" (top={inner_holes_max_count}, мин={inner_holes_min_area}px)" if inner_holes else ""))
    print(f"🗑️  Drop outliers: {'включён' if drop_outliers else 'выключен'}" + (f" (±{drop_std}σ)" if drop_outliers else ""))

    tmp_dir = tempfile.mkdtemp()

    # ── Проход 1: обрабатываем все кадры, собираем статистику ──────────────
    print(f"\n⏳ Проход 1/2: обрабатываю кадры...")

    frame_results = []   # (frame_idx, removed_ratio, used_tol, bg_color)
    prev_bg_color = None
    prev_removed_ratio = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        bgra, bg_color, used_tol, removed_ratio = remove_background_frame(
            frame,
            tolerance=tolerance,
            tolerance_max=tolerance_max,
            prev_removed_ratio=prev_removed_ratio,
            inner_holes=inner_holes,
            inner_holes_min_area=inner_holes_min_area,
            inner_holes_max_count=inner_holes_max_count,
            halo_remove=halo_remove,
        )

        out_path = os.path.join(tmp_dir, f"frame_{frame_idx:06d}.png")
        cv2.imwrite(out_path, bgra)
        frame_results.append((frame_idx, removed_ratio, used_tol, bg_color.copy()))

        color_changed = (
            prev_bg_color is None or
            np.max(np.abs(bg_color.astype(int) - prev_bg_color.astype(int))) > 10
        )
        tol_bumped = used_tol > tolerance
        if color_changed or tol_bumped:
            b, g, r = bg_color
            flag = f"⚠️  tol={used_tol}" if tol_bumped else f"tol={used_tol}"
            print(f"  кадр {frame_idx:4d}: RGB({r},{g},{b})  удалено={removed_ratio:.1%}  {flag}")

        prev_bg_color = bg_color
        prev_removed_ratio = removed_ratio
        frame_idx += 1
        if frame_idx % 20 == 0:
            print(f"  ⏳ {frame_idx}/{total_frames}...", end='\r')

    cap.release()
    print(f"\n✅ Проход 1 завершён: {frame_idx} кадров")

    # ── Фильтрация аутлаеров ────────────────────────────────────────────────
    ratios = np.array([r[1] for r in frame_results])
    keep_indices = set(range(len(frame_results)))

    if drop_outliers:
        median = np.median(ratios)
        std    = np.std(ratios)
        low    = median - drop_std * std
        high   = median + drop_std * std
        print(f"\n📊 Статистика removed_ratio: median={median:.1%}  std={std:.1%}")
        print(f"   Порог отсева (минимум): {low:.1%}")

        dropped = []
        for i, (fidx, ratio, _, _) in enumerate(frame_results):
            if ratio < low:
                dropped.append((fidx, ratio))
                keep_indices.discard(i)

        if dropped:
            print(f"🗑️  Удалено {len(dropped)} аутлаер-кадров:")
            for fidx, ratio in dropped:
                print(f"    кадр {fidx:4d}: удалено={ratio:.1%}")
        else:
            print("✅ Аутлаеров не найдено")

    # ── Проход 2: собираем финальное видео только из нужных кадров ──────────
    kept_frames = [frame_results[i][0] for i in sorted(keep_indices)]
    print(f"\n🎬 Проход 2/2: собираю {output_path} ({len(kept_frames)} кадров)...")

    # Пишем список файлов для ffmpeg concat
    concat_file = os.path.join(tmp_dir, "concat.txt")
    with open(concat_file, "w") as f:
        for fidx in kept_frames:
            fpath = os.path.join(tmp_dir, f"frame_{fidx:06d}.png")
            f.write(f"file '{fpath}'\n")
            f.write(f"duration {1.0 / fps}\n")

    cmd = (
        f'ffmpeg -y -f concat -safe 0 -i "{concat_file}" '
        f'-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 10 '
        f'"{output_path}"'
    )
    ret = os.system(cmd)

    for f in glob.glob(os.path.join(tmp_dir, "*.png")):
        os.remove(f)
    os.remove(concat_file)
    os.rmdir(tmp_dir)

    if ret == 0:
        print(f"✅ Готово! Сохранено: {output_path}")
    else:
        print("❌ ffmpeg не найден. Установи: https://ffmpeg.org/download.html")


def extract_frames(
    input_path: str,
    output_dir: str = None,
    tolerance: int = 15,
    tolerance_max: int = 40,
    inner_holes: bool = False,
    inner_holes_min_area: int = 0,
    inner_holes_max_count: int = 0,
    halo_remove: int = 1,
    drop_outliers: bool = False,
    drop_std: float = 3.0,
):
    """
    Обрабатывает видео и сохраняет кадры как PNG в папку с именем видеофайла.
    idle.mp4 → idle/0.png, idle/1.png, ...
    """
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"❌ Не могу открыть файл: {input_path}")
        return

    base_name = os.path.splitext(os.path.basename(input_path))[0]
    parent_dir = os.path.dirname(input_path) if output_dir is None else output_dir
    frames_dir = os.path.join(parent_dir, base_name)
    os.makedirs(frames_dir, exist_ok=True)

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"\n📹 {input_path}: {width}x{height}, {fps:.1f} fps, {total_frames} кадров")
    print(f"📁 Папка: {frames_dir}")

    frame_data = []
    prev_removed_ratio = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        bgra, bg_color, used_tol, removed_ratio = remove_background_frame(
            frame,
            tolerance=tolerance,
            tolerance_max=tolerance_max,
            prev_removed_ratio=prev_removed_ratio,
            inner_holes=inner_holes,
            inner_holes_min_area=inner_holes_min_area,
            inner_holes_max_count=inner_holes_max_count,
            halo_remove=halo_remove,
        )

        frame_data.append((frame_idx, bgra, removed_ratio))
        prev_removed_ratio = removed_ratio
        frame_idx += 1
        if frame_idx % 20 == 0:
            print(f"  ⏳ {frame_idx}/{total_frames}...", end='\r')

    cap.release()
    print(f"  Обработано: {frame_idx} кадров")

    ratios = np.array([r[2] for r in frame_data])
    keep_indices = set(range(len(frame_data)))

    if drop_outliers:
        median = np.median(ratios)
        std = np.std(ratios)
        low = median - drop_std * std
        dropped = 0
        for i, (fidx, _, ratio) in enumerate(frame_data):
            if ratio < low:
                keep_indices.discard(i)
                dropped += 1
        if dropped:
            print(f"  🗑️  Удалено {dropped} аутлаер-кадров")

    saved = 0
    for i in sorted(keep_indices):
        _, bgra, _ = frame_data[i]
        out_path = os.path.join(frames_dir, f"{saved}.png")
        cv2.imwrite(out_path, bgra)
        saved += 1

    print(f"  ✅ Сохранено {saved} кадров → {frames_dir}")
    return frames_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Удаление фона из MP4 по контуру")
    parser.add_argument("--input",         required=True,                     help="Входной MP4 файл")
    parser.add_argument("--output",        default="output_transparent.webm", help="Выходной WebM файл")
    parser.add_argument("--tolerance",     type=int,   default=20,            help="Начальный tolerance (default: 15)")
    parser.add_argument("--tolerance-max", type=int,   default=30,            help="Максимальный tolerance (default: 40)")
    parser.add_argument("--inner-holes",   action="store_true",               help="Удалять изолированные области цвета фона внутри персонажа")
    parser.add_argument("--inner-holes-min-area",   type=int, default=100,      help="Минимальная площадь дыры в пикселях (default: 0 = все)")
    parser.add_argument("--inner-holes-max-count",  type=int, default=10,      help="Макс. кол-во дыр на кадр, самые большие (default: 0 = все)")
    parser.add_argument("--halo-remove",            type=int, default=3,      help="Эрозия альфа-канала для удаления гало вокруг персонажа (px, default: 1, 0=выкл)")
    parser.add_argument("--drop-outliers", action="store_true",               help="Удалять кадры где удалено аномально мало/много фона")
    parser.add_argument("--drop-std",      type=float, default=3.0,           help="Порог в стандартных отклонениях для --drop-outliers (default: 3.0)")
    parser.add_argument("--frames",        action="store_true",               help="Сохранить кадры как PNG в папки (idle.mp4 → idle/0.png, 1.png, ...)")
    parser.add_argument("--frames-dir",    default=None,                      help="Корневая папка для --frames (default: рядом с input)")
    args = parser.parse_args()

    common_kwargs = dict(
        tolerance=args.tolerance,
        tolerance_max=args.tolerance_max,
        inner_holes=args.inner_holes,
        inner_holes_min_area=args.inner_holes_min_area,
        inner_holes_max_count=args.inner_holes_max_count,
        halo_remove=args.halo_remove,
        drop_outliers=args.drop_outliers,
        drop_std=args.drop_std,
    )

    handler = extract_frames if args.frames else None

    if os.path.isdir(args.input):
        mp4_files = [f for f in os.listdir(args.input) if f.endswith(".mp4")]
        print(f"📂 Папка: {args.input} ({len(mp4_files)} видео)")

        if args.frames:
            for file in mp4_files:
                extract_frames(
                    os.path.join(args.input, file),
                    output_dir=args.frames_dir,
                    **common_kwargs,
                )
        else:
            for file in mp4_files:
                process_video(
                    os.path.join(args.input, file),
                    os.path.join(args.input, file.replace(".mp4", ".webm")),
                    **common_kwargs,
                )
    else:
        if args.frames:
            extract_frames(
                args.input,
                output_dir=args.frames_dir,
                **common_kwargs,
            )
        else:
            process_video(
                input_path=args.input,
                output_path=args.output,
                **common_kwargs,
            )