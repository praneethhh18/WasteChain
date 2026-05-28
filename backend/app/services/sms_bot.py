"""SMS bot state machine.

Why SMS and not WhatsApp: kabadiwalas often run feature phones, work in low-
signal yards, and don't keep WhatsApp logged in all day. SMS works on every
GSM device on Earth, costs the user nothing inbound, and survives in 2G dead
zones. Every menu is numbered — no typing, no language barrier on the input
side. Outbound text is rendered in the user's language (en/hi/kn).

The simulator UI in the frontend just hits POST /sms/inbound — the exact same
endpoint a Twilio webhook would call. Swap the simulator for Twilio later by
flipping one URL.
"""

from datetime import datetime
from typing import Optional, Tuple
from sqlalchemy.orm import Session

from .. import models
from .batches import create_batch_record
from .matching import rank_matches


MATERIALS = ["PET", "PAPER", "CARDBOARD", "METAL", "GLASS"]

T = {
    "en": {
        "welcome": "WasteChain ready. Reply with:\n1 Log batch\n2 My best buyer today\n3 My earnings\n9 Change language",
        "unknown_phone": "This phone is not registered. Ask your area coordinator to add you.",
        "pick_material": "Pick material:\n1 PET bottles\n2 Paper\n3 Cardboard\n4 Metal\n5 Glass\n0 Cancel",
        "enter_weight": "Enter weight in kg (e.g. 42 or 42.5).\n0 Cancel",
        "confirm": "Confirm: {weight} kg of {material}.\n1 Yes, log it\n0 Cancel",
        "logged": "Logged. Batch {code}. Hash {hash}. Best buyer: {best}.",
        "logged_no_match": "Logged. Batch {code}. Hash {hash}. No live bid yet — we'll text you when one matches.",
        "best_today": "Best today: {best}",
        "no_bids": "No live bids in your area right now. Try again in an hour.",
        "earnings": "This week: {kg} kg moved across {n} batches. Est earnings INR {inr}.",
        "language_menu": "Language:\n1 English\n2 हिंदी\n3 ಕನ್ನಡ",
        "cancelled": "Cancelled. Reply 1 to start again.",
        "invalid": "Reply with a menu number.",
        "lang_set": "Language set to English.",
    },
    "hi": {
        "welcome": "WasteChain तैयार है। जवाब दें:\n1 बैच लॉग करें\n2 आज का सबसे अच्छा खरीदार\n3 मेरी कमाई\n9 भाषा बदलें",
        "unknown_phone": "यह नंबर पंजीकृत नहीं है। अपने एरिया कोऑर्डिनेटर से कहें।",
        "pick_material": "सामान चुनें:\n1 PET बोतल\n2 कागज़\n3 गत्ता\n4 धातु\n5 कांच\n0 रद्द",
        "enter_weight": "वजन kg में लिखें (जैसे 42 या 42.5)।\n0 रद्द",
        "confirm": "पक्का करें: {weight} kg {material}।\n1 हाँ, लॉग करें\n0 रद्द",
        "logged": "लॉग हुआ। बैच {code}। हैश {hash}। सबसे अच्छा खरीदार: {best}।",
        "logged_no_match": "लॉग हुआ। बैच {code}। हैश {hash}। अभी कोई बोली नहीं — मिलते ही बताएंगे।",
        "best_today": "आज सबसे अच्छा: {best}",
        "no_bids": "अभी आपके इलाके में कोई बोली नहीं। एक घंटे बाद देखें।",
        "earnings": "इस हफ्ते: {kg} kg, {n} बैच। अनुमानित कमाई INR {inr}।",
        "language_menu": "भाषा:\n1 English\n2 हिंदी\n3 ಕನ್ನಡ",
        "cancelled": "रद्द कर दिया। फिर से शुरू करने को 1 भेजें।",
        "invalid": "मेन्यू नंबर भेजें।",
        "lang_set": "भाषा हिंदी में सेट।",
    },
    "kn": {
        "welcome": "WasteChain ಸಿದ್ಧ. ಉತ್ತರಿಸಿ:\n1 ಬ್ಯಾಚ್ ಲಾಗ್\n2 ಇಂದಿನ ಅತ್ಯುತ್ತಮ ಖರೀದಿದಾರ\n3 ನನ್ನ ಸಂಪಾದನೆ\n9 ಭಾಷೆ ಬದಲಿಸಿ",
        "unknown_phone": "ಈ ಸಂಖ್ಯೆ ನೋಂದಾಯಿಸಿಲ್ಲ. ಪ್ರದೇಶ ಸಂಯೋಜಕರನ್ನು ಕೇಳಿ.",
        "pick_material": "ಸಾಮಗ್ರಿ ಆಯ್ಕೆ ಮಾಡಿ:\n1 PET ಬಾಟಲಿ\n2 ಕಾಗದ\n3 ರಟ್ಟು\n4 ಲೋಹ\n5 ಗಾಜು\n0 ರದ್ದು",
        "enter_weight": "ತೂಕವನ್ನು kg ನಲ್ಲಿ ಬರೆಯಿರಿ (ಉದಾ 42 ಅಥವಾ 42.5).\n0 ರದ್ದು",
        "confirm": "ದೃಢೀಕರಿಸಿ: {weight} kg {material}.\n1 ಹೌದು, ಲಾಗ್\n0 ರದ್ದು",
        "logged": "ಲಾಗ್ ಆಯಿತು. ಬ್ಯಾಚ್ {code}. ಹ್ಯಾಶ್ {hash}. ಅತ್ಯುತ್ತಮ ಖರೀದಿದಾರ: {best}.",
        "logged_no_match": "ಲಾಗ್ ಆಯಿತು. ಬ್ಯಾಚ್ {code}. ಹ್ಯಾಶ್ {hash}. ಸದ್ಯ ಬಿಡ್ ಇಲ್ಲ — ಸಿಕ್ಕಾಗ ಸಂದೇಶ ಬರುತ್ತದೆ.",
        "best_today": "ಇಂದು ಅತ್ಯುತ್ತಮ: {best}",
        "no_bids": "ನಿಮ್ಮ ಪ್ರದೇಶದಲ್ಲಿ ಈಗ ಯಾವುದೇ ಬಿಡ್ ಇಲ್ಲ.",
        "earnings": "ಈ ವಾರ: {kg} kg, {n} ಬ್ಯಾಚ್. ಅಂದಾಜು INR {inr}.",
        "language_menu": "ಭಾಷೆ:\n1 English\n2 हिंदी\n3 ಕನ್ನಡ",
        "cancelled": "ರದ್ದು. ಪ್ರಾರಂಭಿಸಲು 1 ಕಳುಹಿಸಿ.",
        "invalid": "ಮೆನು ಸಂಖ್ಯೆ ಕಳುಹಿಸಿ.",
        "lang_set": "ಭಾಷೆ ಕನ್ನಡಕ್ಕೆ ಬದಲಾಯಿಸಲಾಗಿದೆ.",
    },
}


def _t(lang: str, key: str, **kw) -> str:
    bundle = T.get(lang, T["en"])
    return bundle.get(key, T["en"][key]).format(**kw)


def _log(db: Session, phone: str, direction: str, body: str, state=None):
    db.add(models.SmsMessage(
        phone=phone, direction=direction, body=body, session_state=state,
    ))


def _get_user(db: Session, phone: str) -> Optional[models.User]:
    return db.query(models.User).filter(models.User.phone == phone).first()


def _get_or_create_session(db: Session, phone: str, user_lang: str) -> models.SmsSession:
    sess = db.query(models.SmsSession).filter(models.SmsSession.phone == phone).first()
    if not sess:
        sess = models.SmsSession(phone=phone, state="IDLE", context={}, language=user_lang)
        db.add(sess)
        db.flush()
    return sess


def _format_best_match(matches: list) -> str:
    if not matches:
        return ""
    m = matches[0]
    delta = m["earnings_delta_inr"]
    sign = "+" if delta >= 0 else ""
    return f"{m['recycler_name']} INR {m['price_per_kg']}/kg = INR {m['expected_earnings_inr']:.0f} ({sign}{delta:.0f} vs usual)"


def handle_inbound(db: Session, phone: str, body: str) -> str:
    body = (body or "").strip()
    user = _get_user(db, phone)

    _log(db, phone, "IN", body)

    if not user:
        msg = T["en"]["unknown_phone"]
        _log(db, phone, "OUT", msg)
        return msg

    sess = _get_or_create_session(db, phone, user.language)
    lang = sess.language or user.language or "en"
    ctx = dict(sess.context or {})
    state = sess.state or "IDLE"
    reply: str

    # global commands
    if body.upper() in ("HI", "HELLO", "MENU", "START") or state == "IDLE":
        if state == "IDLE" and body not in ("1", "2", "3", "9"):
            reply = _t(lang, "welcome")
            state = "MAIN_MENU"
        else:
            state = "MAIN_MENU"
            reply = _t(lang, "welcome")
    elif state == "MAIN_MENU":
        if body == "1":
            state = "PICK_MATERIAL"
            reply = _t(lang, "pick_material")
        elif body == "2":
            reply = _best_buyer_summary(db, user, lang)
            state = "IDLE"
        elif body == "3":
            reply = _earnings_summary(db, user, lang)
            state = "IDLE"
        elif body == "9":
            state = "PICK_LANGUAGE"
            reply = _t(lang, "language_menu")
        else:
            reply = _t(lang, "invalid")
    elif state == "PICK_LANGUAGE":
        mapping = {"1": "en", "2": "hi", "3": "kn"}
        if body in mapping:
            lang = mapping[body]
            sess.language = lang
            user.language = lang
            reply = _t(lang, "lang_set") + "\n\n" + _t(lang, "welcome")
            state = "MAIN_MENU"
        else:
            reply = _t(lang, "invalid")
    elif state == "PICK_MATERIAL":
        if body == "0":
            state = "IDLE"
            reply = _t(lang, "cancelled")
        elif body in ("1", "2", "3", "4", "5"):
            ctx["material"] = MATERIALS[int(body) - 1]
            state = "ENTER_WEIGHT"
            reply = _t(lang, "enter_weight")
        else:
            reply = _t(lang, "invalid")
    elif state == "ENTER_WEIGHT":
        if body == "0":
            state = "IDLE"
            reply = _t(lang, "cancelled")
        else:
            try:
                weight = float(body)
                if weight <= 0 or weight > 5000:
                    raise ValueError()
                ctx["weight"] = weight
                state = "CONFIRM"
                reply = _t(lang, "confirm", weight=weight, material=ctx["material"])
            except ValueError:
                reply = _t(lang, "enter_weight")
    elif state == "CONFIRM":
        if body == "1":
            batch = create_batch_record(
                db, creator=user, material=ctx["material"], weight=ctx["weight"],
                lat=user.lat or 12.87, lon=user.lon or 74.84,
                area=user.area, source_channel="sms",
            )
            matches = rank_matches(db, batch, limit=1)
            short_hash = batch.record_hash[:10]
            if matches:
                reply = _t(lang, "logged",
                           code=batch.batch_code, hash=short_hash,
                           best=_format_best_match(matches))
            else:
                reply = _t(lang, "logged_no_match",
                           code=batch.batch_code, hash=short_hash)
            state = "IDLE"
            ctx = {}
        elif body == "0":
            state = "IDLE"
            ctx = {}
            reply = _t(lang, "cancelled")
        else:
            reply = _t(lang, "invalid")
    else:
        state = "IDLE"
        reply = _t(lang, "welcome")

    sess.state = state
    sess.context = ctx
    sess.updated_at = datetime.utcnow()
    _log(db, phone, "OUT", reply, state={"state": state, "context": ctx, "lang": lang})
    return reply


def _best_buyer_summary(db: Session, user: models.User, lang: str) -> str:
    # Find any of the user's recent AVAILABLE batches to score against, or
    # synthesise a hypothetical PET batch as a teaser.
    batch = (
        db.query(models.Batch)
        .filter(models.Batch.creator_id == user.id)
        .filter(models.Batch.status == "AVAILABLE")
        .order_by(models.Batch.id.desc())
        .first()
    )
    if not batch:
        # synthesise — score against PET 50kg from user's location
        fake = models.Batch(
            id=0, batch_code="HYPO", creator_id=user.id,
            material_type="PET", weight_kg=50,
            lat=user.lat or 12.87, lon=user.lon or 74.84,
            status="AVAILABLE", record_hash="x", previous_hash="x",
            created_at=datetime.utcnow(),
        )
        matches = rank_matches(db, fake, limit=1)
    else:
        matches = rank_matches(db, batch, limit=1)
    if not matches:
        return _t(lang, "no_bids")
    return _t(lang, "best_today", best=_format_best_match(matches))


def _earnings_summary(db: Session, user: models.User, lang: str) -> str:
    from datetime import timedelta
    week_ago = datetime.utcnow() - timedelta(days=7)
    batches = (
        db.query(models.Batch)
        .filter(models.Batch.creator_id == user.id)
        .filter(models.Batch.created_at >= week_ago)
        .all()
    )
    total_kg = sum(b.weight_kg for b in batches)
    # use accepted matches for INR estimate
    inr = 0.0
    for b in batches:
        m = (
            db.query(models.Match)
            .filter(models.Match.batch_id == b.id, models.Match.accepted == True)  # noqa: E712
            .first()
        )
        if m:
            inr += m.expected_earnings_inr
        else:
            usual = (user.usual_price_inr or {}).get(b.material_type, 0)
            inr += usual * b.weight_kg
    return _t(lang, "earnings", kg=f"{total_kg:.1f}", n=len(batches), inr=f"{inr:.0f}")
