from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field

if __package__ == "backend.routes":
    from ..services.narration import MAX_TEXT, NarrationUnavailable, render_narration
else:
    from services.narration import MAX_TEXT, NarrationUnavailable, render_narration

router = APIRouter(prefix="/narration", tags=["narration"])


class NarrationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    text: str = Field(min_length=1, max_length=MAX_TEXT)


@router.post("")
def prepare_narration(body: NarrationRequest):
    try:
        audio = render_narration(body.text)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None
    except NarrationUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from None
    return Response(content=audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})
