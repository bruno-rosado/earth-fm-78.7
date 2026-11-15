from fastapi import APIRouter

from . import tracks, music_config, search

router = APIRouter(prefix="/api")
router.include_router(tracks.router)
router.include_router(music_config.router)
router.include_router(search.router)
