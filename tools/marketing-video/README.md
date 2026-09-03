# Marketing Video Generator

Generates vertical (1080×1920) TikTok/Snapchat ad videos for **Al Nawader Veterinary Care Center**.

## Requirements

- Python 3 + Pillow (`pip install pillow`)
- ffmpeg
- Example infographic images in workspace assets (optional hero crop)

## Usage

```bash
python3 tools/marketing-video/generate-ad-video.py --topic miscarriage
python3 tools/marketing-video/generate-ad-video.py --topic brucella
python3 tools/marketing-video/generate-ad-video.py --topic parasites
python3 tools/marketing-video/generate-ad-video.py --topic urea
python3 tools/marketing-video/generate-ad-video.py --topic cbc
```

Output: `/opt/cursor/artifacts/videos/al-nawader-ad-<topic>.mp4` (or custom `--output` name).

## Video structure (~22 seconds)

1. Intro — brand + title + hero image  
2. Reasons — animated list  
3. Prevention tips  
4. Services + phone + location CTA  

Add background music in TikTok/Snapchat before publishing (video has no audio track).
