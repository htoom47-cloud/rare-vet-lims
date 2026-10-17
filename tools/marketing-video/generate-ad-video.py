#!/usr/bin/env python3
"""
Generate vertical TikTok/Snapchat ad video for Al Nawader Veterinary Care Center.
Usage: python3 tools/marketing-video/generate-ad-video.py [--topic brucella|miscarriage|parasites|urea|cbc]
"""
from __future__ import annotations

import argparse
import math
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
ASSETS = Path("/home/ubuntu/.cursor/projects/workspace/assets")
OUT_DIR = Path("/opt/cursor/artifacts/videos")
FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/noto/NotoKufiArabic-Regular.ttf"
FONT_EN = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

W, H = 1080, 1920
FPS = 30
BG = (26, 61, 46)  # #1a3d2e
GOLD = (201, 162, 39)  # #c9a227
WHITE = (255, 255, 255)
LIGHT = (230, 240, 235)


@dataclass
class Topic:
    id: str
    image: str
    title: str
    intro: str
    reasons: list[str]
    tips: list[str]
    cta: str


TOPICS: dict[str, Topic] = {
    "miscarriage": Topic(
        id="miscarriage",
        image="01a03f8e-fd9e-79a4-94a5-da102683d7b1.jpg",
        title="أسباب الإجهاض المتكرر في الإبل",
        intro="الإجهاض المتكرر يسبب خسائر اقتصادية كبيرة — الكشف المبكر يحد من المشكلة",
        reasons=[
            "أمراض معدية — الحمى المالطية والكلاميديا",
            "أمراض وراثية تؤثر على نمو الجنين",
            "سوء التغذية — نقص الفيتامينات",
            "تسمم — نباتات أو مواد كيميائية",
            "طفيليات داخلية وخارجية",
            "اضطرابات هرمونية أثناء الحمل",
        ],
        tips=[
            "التطعيم الدوري حسب برنامج الطبيب",
            "تغذية متوازنة للناقة الحامل",
            "فحص دوري قبل موسم التربية",
            "عزل الحالات المشتبه بها فوراً",
            "نظافة الحظائر ومصادر الماء",
        ],
        cta="فحص الحمى المالطية — تواصل معنا",
    ),
    "brucella": Topic(
        id="brucella",
        image="01a03f8e-fd9e-79a4-94a5-da102683d7b1.jpg",
        title="الحمى المالطية — خطر صامت على الإنتاج!",
        intro="مرض الحمى المالطية يسبب إجهاضاً وعقمًا بدون أعراض واضحة — الكشف المخبري ضروري",
        reasons=[
            "عدوى بكتيرية — الحمى المالطية",
            "نقل العدوى بين الحيوانات",
            "حليب ملوث — خطر على الأبناء",
            "إجهاض متأخر في الشهور الأخيرة",
            "العقم في الذكور والإناث",
            "حامل للمرض بدون أعراض",
        ],
        tips=[
            "فحص الحمى المالطية قبل كل موسم تربية",
            "عزل المشتبه به فوراً",
            "التطعيم حسب توصية الطبيب",
            "نظافة أدوات الولادة",
            "استشارة المختبر عند أي إجهاض",
        ],
        cta="تحليل الحمى المالطية — نتائج دقيقة وسريعة",
    ),
    "parasites": Topic(
        id="parasites",
        image="01a03f8e-fdaf-7da5-a7c8-cbbeec254368.jpg",
        title="الأمراض الطفيلية — خطر صامت!",
        intro="الطفيليات الداخلية والخارجية تؤثر على صحة وإنتاجية الحيوان",
        reasons=[
            "ديدان دائرية وشريطية",
            "قراد — جرب — قمل",
            "بوغ وذباب ينقل الأمراض",
            "كوكسيديا واوليات",
            "ضعف المناعة والنمو",
            "خسائر اقتصادية كبيرة",
        ],
        tips=[
            "برنامج تطعيم وطارد دوري",
            "نظافة المرابط ومصادر الماء",
            "فحص براز دوري",
            "عزل الحيوانات المصابة",
            "استشر الطبيب البيطري",
        ],
        cta="فحص طفيليات — دم وبراز",
    ),
    "urea": Topic(
        id="urea",
        image="01a03f8e-fdc0-721c-ad50-1e8d42e43bb6.jpg",
        title="ارتفاع اليوريا — ماذا يعني؟",
        intro="اليوريا المرتفع قد يدل على مشاكل كلى أو زيادة البروتين في العلف",
        reasons=[
            "مشاكل في الكلى",
            "مشاكل في الكبد",
            "زيادة البروتين في العلف",
            "جفاف وقلة شرب الماء",
            "انسداد المسالك البولية",
        ],
        tips=[
            "وفر ماءً نظيفاً دائماً",
            "قلل البروتين في العلف",
            "افحص وظائف الكلى والكبد",
            "استشر الطبيب البيطري",
            "تابع الحالة دورياً",
        ],
        cta="لوحة كيمياء حيوية — يوريا وكرياتينين",
    ),
    "cbc": Topic(
        id="cbc",
        image="01a03f8e-fdd1-7d2a-a02a-5cc61e106bcc.jpg",
        title="متى يحتاج الحيوان تعداد دم شامل؟",
        intro="تحليل الدم الشامل يكشف أمراضاً قبل ظهور الأعراض الخارجية",
        reasons=[
            "فقر الدم",
            "الالتهاب والعدوى",
            "مشاكل المناعة",
            "نزيف داخلي",
            "طفيليات الدم",
        ],
        tips=[
            "فحص دوري كل 6 أشهر",
            "قبل موسم التربية أو السباق",
            "عند فقدان وزن غير مبرر",
            "بعد أي مرض أو عملية",
            "احتفظ بسجل للمقارنة",
        ],
        cta="تعداد دم كامل — نتائج خلال 24 ساعة",
    ),
}


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * max(0.0, min(1.0, t))


def ease_out_cubic(t: float) -> float:
    return 1 - (1 - t) ** 3


def wrap_text(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textlength(test, font=fnt) <= max_w:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [text]


def draw_centered_lines(
    draw: ImageDraw.ImageDraw,
    lines: list[str],
    y: int,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    spacing: int = 14,
) -> int:
    heights = [draw.textbbox((0, 0), ln, font=fnt)[3] for ln in lines]
    total = sum(heights) + spacing * (len(lines) - 1)
    cy = y
    for i, ln in enumerate(lines):
        tw = draw.textlength(ln, font=fnt)
        draw.text(((W - tw) / 2, cy), ln, font=fnt, fill=fill)
        cy += heights[i] + spacing
    return cy


def new_frame() -> Image.Image:
    return Image.new("RGB", (W, H), BG)


def draw_header(frame: Image.Image, alpha: float = 1.0) -> None:
    draw = ImageDraw.Draw(frame)
    f_brand = font(FONT_BOLD, 34)
    f_en = font(FONT_EN, 18)
    f_badge = font(FONT_REG, 26)

    brand = "مركز رعاية النوادر البيطري"
    en = "AL NAWADER VETERINARY CARE CENTER"

    ba = int(255 * alpha)
    draw.text((60, 55), brand, font=f_brand, fill=GOLD + (ba,) if len(GOLD) == 3 else GOLD)
    draw.text((60, 100), en, font=f_en, fill=(*LIGHT[:3],) if alpha >= 1 else (200, 210, 205))

    badge = "💡 معلومة اليوم"
    bw = draw.textlength(badge, font=f_badge)
    bx, by = W - bw - 50, 60
    draw.rounded_rectangle([bx - 20, by - 10, bx + bw + 20, by + 50], radius=20, fill=(35, 75, 58))
    draw.text((bx, by), badge, font=f_badge, fill=GOLD)

    draw.line([(50, 155), (W - 50, 155)], fill=GOLD, width=2)


def load_hero_crop(topic: Topic) -> Image.Image:
    path = ASSETS / topic.image
    if not path.exists():
        raise FileNotFoundError(path)
    img = Image.open(path).convert("RGB")
    # Crop camel/hero area from top-right of infographic (~40% width, upper half)
    iw, ih = img.size
    crop = img.crop((int(iw * 0.52), int(ih * 0.08), iw - 20, int(ih * 0.42)))
    crop.thumbnail((520, 520), Image.Resampling.LANCZOS)
    return crop


def paste_hero(frame: Image.Image, hero: Image.Image, slide: float = 0.0, fade: float = 1.0) -> None:
    x = int(W - hero.width - 40 + slide)
    y = 200
    if fade < 1.0:
        layer = hero.copy()
        layer.putalpha(int(255 * fade))
        frame.paste(layer, (x, y), layer)
    else:
        frame.paste(hero, (x, y))


def draw_gold_title(draw: ImageDraw.ImageDraw, title: str, y: int, max_size: int = 56) -> int:
    fnt = font(FONT_BOLD, max_size)
    lines = wrap_text(draw, title, fnt, W - 580)
    while len(lines) > 3 and max_size > 38:
        max_size -= 2
        fnt = font(FONT_BOLD, max_size)
        lines = wrap_text(draw, title, fnt, W - 580)
    cy = y
    for ln in lines:
        draw.text((60, cy), ln, font=fnt, fill=GOLD)
        cy += max_size + 8
    return cy


def scene_intro(topic: Topic, hero: Image.Image, n_frames: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for i in range(n_frames):
        t = ease_out_cubic(i / max(1, n_frames - 1))
        frame = new_frame()
        draw = ImageDraw.Draw(frame)
        draw_header(frame, t)
        paste_hero(frame, hero, slide=lerp(80, 0, t), fade=t)

        title_y = draw_gold_title(draw, topic.title, 720)
        intro_f = font(FONT_REG, 30)
        intro_lines = wrap_text(draw, topic.intro, intro_f, W - 120)
        alpha_intro = int(255 * max(0, (t - 0.3) / 0.7))
        for j, ln in enumerate(intro_lines[:3]):
            draw.text((60, title_y + 20 + j * 42), ln, font=intro_f, fill=(alpha_intro, alpha_intro + 10, alpha_intro))

        frames.append(frame)
    return frames


def scene_reasons(topic: Topic, n_frames: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    count = len(topic.reasons)
    per_item = max(1, n_frames // (count + 1))

    for i in range(n_frames):
        frame = new_frame()
        draw = ImageDraw.Draw(frame)
        draw_header(frame)

        draw.text((60, 200), "أهم الأسباب", font=font(FONT_BOLD, 44), fill=GOLD)
        draw.line([(60, 260), (400, 260)], fill=GOLD, width=3)

        visible = min(count, max(0, i // per_item))
        y = 300
        for idx in range(visible):
            item = topic.reasons[idx]
            fade_t = ease_out_cubic(min(1.0, (i - idx * per_item) / per_item))
            box_y = y + idx * 115
            draw.rounded_rectangle([50, box_y, W - 50, box_y + 95], radius=18, fill=(35, 75, 58))
            num = font(FONT_BOLD, 28)
            draw.ellipse([70, box_y + 22, 120, box_y + 72], fill=GOLD)
            draw.text((88, box_y + 28), str(idx + 1), font=num, fill=BG)
            item_f = font(FONT_REG, 28)
            lines = wrap_text(draw, item, item_f, W - 200)
            for j, ln in enumerate(lines[:2]):
                col = int(255 * fade_t)
                draw.text((140, box_y + 18 + j * 36), ln, font=item_f, fill=(col, col, col))

        frames.append(frame)
    return frames


def scene_tips(topic: Topic, n_frames: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    count = len(topic.tips)

    for i in range(n_frames):
        frame = new_frame()
        draw = ImageDraw.Draw(frame)
        draw_header(frame)

        draw.text((60, 200), "نصائح للوقاية", font=font(FONT_BOLD, 44), fill=GOLD)
        draw.line([(60, 260), (420, 260)], fill=GOLD, width=3)

        per = max(1, n_frames // (count + 1))
        visible = min(count, max(0, i // per))

        y = 310
        for idx in range(visible):
            tip = topic.tips[idx]
            fade_t = ease_out_cubic(min(1.0, (i - idx * per) / per))
            ty = y + idx * 88
            check = "✓"
            draw.text((70, ty), check, font=font(FONT_BOLD, 36), fill=GOLD)
            tf = font(FONT_REG, 30)
            col = int(255 * fade_t)
            draw.text((120, ty + 2), tip, font=tf, fill=(col, col, col))

        frames.append(frame)
    return frames


def scene_services_cta(topic: Topic, n_frames: int) -> list[Image.Image]:
    features = [
        ("🧪", "عينات بأعلى معايير الجودة"),
        ("🎯", "تحاليل شاملة ومتنوعة"),
        ("🔬", "أجهزة حديثة ومتطورة"),
        ("✅", "نتائج دقيقة وسريعة"),
    ]
    frames: list[Image.Image] = []

    for i in range(n_frames):
        t = i / max(1, n_frames - 1)
        frame = new_frame()
        draw = ImageDraw.Draw(frame)
        draw_header(frame)

        banner_y = 200
        draw.rounded_rectangle([40, banner_y, W - 40, banner_y + 120], radius=16, outline=GOLD, width=2)
        bf = font(FONT_REG, 26)
        banner = "مختبر مجهز بأحدث الأجهزة وفريق متخصص لخدمة حلالك"
        for j, ln in enumerate(wrap_text(draw, banner, bf, W - 100)[:2]):
            draw.text((70, banner_y + 20 + j * 38), ln, font=bf, fill=WHITE)

        fy = 380
        for idx, (icon, label) in enumerate(features):
            fx = 60 + (idx % 2) * 500
            fy_row = fy + (idx // 2) * 180
            appear = ease_out_cubic(max(0, min(1, (t * 4) - idx * 0.5)))
            if appear <= 0:
                continue
            draw.rounded_rectangle([fx, fy_row, fx + 460, fy_row + 150], radius=16, fill=(35, 75, 58))
            draw.text((fx + 20, fy_row + 20), icon, font=font(FONT_REG, 40), fill=GOLD)
            lf = font(FONT_REG, 24)
            for j, ln in enumerate(wrap_text(draw, label, lf, 340)[:2]):
                c = int(255 * appear)
                draw.text((fx + 80, fy_row + 30 + j * 32), ln, font=lf, fill=(c, c, c))

        # CTA block
        pulse = 0.85 + 0.15 * math.sin(t * math.pi * 6)
        cta_y = 920
        draw.rounded_rectangle([40, cta_y, W - 40, cta_y + 200], radius=20, fill=(35, 75, 58), outline=GOLD, width=3)
        draw.text((70, cta_y + 25), topic.cta, font=font(FONT_BOLD, 34), fill=GOLD)

        phone_scale = pulse
        phone_f = font(FONT_BOLD, int(52 * phone_scale))
        phone = "📞 0115007257"
        pw = draw.textlength(phone, font=phone_f)
        draw.text(((W - pw) / 2, cta_y + 85), phone, font=phone_f, fill=WHITE)

        loc_f = font(FONT_REG, 26)
        loc = "📍 مجمع المزاحمية — طريق الملك سلمان — أفينيو"
        lw = draw.textlength(loc, font=loc_f)
        draw.text(((W - lw) / 2, cta_y + 155), loc, font=loc_f, fill=LIGHT)

        # Footer strip
        draw.rectangle([0, H - 90, W, H], fill=(18, 45, 34))
        foot = "RareVetCare.com  |  portal.rarevetcare.com"
        ff = font(FONT_EN, 22)
        fw = draw.textlength(foot, font=ff)
        draw.text(((W - fw) / 2, H - 62), foot, font=ff, fill=GOLD)

        frames.append(frame)
    return frames


def save_frames(frames: list[Image.Image], directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for i, frame in enumerate(frames):
        frame.save(directory / f"frame_{i:05d}.png", optimize=True)


def encode_video(frames_dir: Path, output: Path, fps: int = FPS) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-framerate", str(fps),
        "-i", str(frames_dir / "frame_%05d.png"),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "20",
        "-preset", "medium",
        "-movflags", "+faststart",
        str(output),
    ]
    subprocess.run(cmd, check=True, capture_output=True)


def generate(topic_key: str, output_name: str | None = None) -> Path:
    topic = TOPICS.get(topic_key)
    if not topic:
        raise SystemExit(f"Unknown topic: {topic_key}. Choose from: {', '.join(TOPICS)}")

    hero = load_hero_crop(topic)
    all_frames: list[Image.Image] = []
    all_frames += scene_intro(topic, hero, 3 * FPS)
    all_frames += scene_reasons(topic, 8 * FPS)
    all_frames += scene_tips(topic, 6 * FPS)
    all_frames += scene_services_cta(topic, 5 * FPS)

    out_name = output_name or f"al-nawader-ad-{topic_key}.mp4"
    out_path = OUT_DIR / out_name

    with tempfile.TemporaryDirectory(prefix="advideo_") as tmp:
        tmp_path = Path(tmp)
        save_frames(all_frames, tmp_path)
        encode_video(tmp_path, out_path)

    duration = len(all_frames) / FPS
    print(f"Created {out_path} ({duration:.1f}s, {len(all_frames)} frames)")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate veterinary ad video")
    parser.add_argument("--topic", default="miscarriage", choices=list(TOPICS.keys()))
    parser.add_argument("--output", default=None)
    args = parser.parse_args()
    generate(args.topic, args.output)


if __name__ == "__main__":
    main()
