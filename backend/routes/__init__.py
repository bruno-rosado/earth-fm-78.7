from fastapi import APIRouter

from . import tracks, search

router = APIRouter(prefix="/api")
router.include_router(tracks.router)
router.include_router(search.router)
