from fastapi import APIRouter

from . import tracks

router = APIRouter(prefix="/api")
router.include_router(tracks.router)
