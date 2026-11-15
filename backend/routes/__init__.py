from fastapi import APIRouter

from . import narration, search, track_search, tracks

router = APIRouter(prefix="/api")
router.include_router(tracks.router)
router.include_router(narration.router)
router.include_router(track_search.router)
router.include_router(search.router)
