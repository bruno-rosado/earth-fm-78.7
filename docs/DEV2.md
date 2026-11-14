# Dev 2: NASA data to numbers (Python)
You turn a NASA video into `features.json`. You work in `backend/pipeline/` (create it).

1. **Pick ONE NASA Earth video** from NASA's Earth Information Center or Scientific Visualization Studio. It must be allowed to be reused. A flat world map (equirectangular) is best, because it wraps onto the globe. Save it to `backend/media/`.
   Done when the team agrees on the video. Do this on Day 1.
2. **Agree on the JSON shapes** with Dev 1 (see HOW_IT_WORKS).
3. **Create `backend/pipeline/extract.py`.** Run `pip install opencv-python numpy` and add both packages to `requirements.txt`. Open the video with `cv2.VideoCapture` and read about 2 frames per second.
4. **Compute the numbers per frame:**
   - brightness: the average pixel value divided by 255
   - motion: how different this frame is from the last one
   - Scale both to 0–1.
5. **Write `backend/data/features/{id}.json`.** Add the album entry to `data/tracks.json`, with the title, the video filename and the duration.
   Done when `python pipeline/extract.py` produces the file and the frontend plays it.
6. **Extra:** add a real science number, like temperature, if the video has data behind it. Say where it came from.

OpenCV video basics: https://docs.opencv.org/4.x/dd/d43/tutorial_py_video_display.html

---
## Scope
- **You own:** `backend/pipeline/`, choosing the NASA video, and generating `data/features/{id}.json` plus the album entry.
- **Not yours:** API endpoints (Dev 1), and how the numbers sound (Dev 4) or look (Dev 3).

## Who's blocked by whom
- **Dev 3 is blocked by your video choice.** They need to know whether it's a flat world map they can wrap on the globe.
- **Dev 4 depends on your feature names and ranges.** The plan is brightness and motion, both 0–1.
- **You're blocked by Dev 1** only for the agreed JSON shape.

## Most critical to nail down
1. **Which NASA video**, and confirm it's allowed to be reused and is a flat world map. Do this on Day 1, morning.
2. **The feature list and ranges.** Don't rename them later without telling Devs 1 and 4.
3. **The time step**, e.g. one point every 0.5 seconds, with the `t` field in seconds.
