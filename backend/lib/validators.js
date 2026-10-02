// backend/lib/validators.js
// Server-side auth validation. Mirrors frontend/lib/authValidation.ts.
// No external verification API used.

const DISPOSABLE_DOMAINS = [
  "0-mail.com", "0815.ru", "1secmail.com", "1secmail.net", "1secmail.org",
  "20minutemail.com", "2prong.com", "420blaze.it", "5ymail.com", "aaathats3as.com",
  "astarmail.com", "bestmail.us", "beyourx.com", "binka.me", "bmf.cx",
  "bofthew.com", "brefmail.com", "buzzcluby.com", "cakiewang.com", "cellurl.com",
  "cheaphub.net", "chogmail.com", "clrmail.com", "cmail.club",
  "crazymailing.com", "curryfan.de", "damnthespam.com", "dicksinhishan.com",
  "dildosfromspace.com", "discard.email", "dispostable.com", "dodgeit.com",
  "dontreg.com", "dropmail.me", "dump-email.info", "e4ward.com", "emailfake.com",
  "emailnator.com", "emailtemporario.com.br", "emltmp.com", "extraam.com",
  "fakemail.net", "fakeinbox.com", "fammix.com", "fdfdsfds.com", "filzmail.com",
  "fizmail.com", "fleckens.hu", "frapmail.com", "fuckme69.club", "fuckingduck.com",
  "fuddletech.com", "getairmail.com", "getnada.com", "giantmail.de", "gmial.com",
  "gmal.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de",
  "guerrillamail.info", "guerrillamail.net", "guerrillamail.org", "hatespam.org",
  "herpderp.nl", "hotmai.com", "hula22.com", "imstations.com", "inboxalias.com",
  "inboxbear.com", "inboxkitten.com", "jeodis.com", "junkmail.com", "kalapi.org",
  "kebi.com", "killmail.net", "kito.dev", "klovenode.com", "kurzepost.de",
  "lags.us", "lameguy.net", "lolmail.biz", "lookugly.com", "lroid.com",
  "mailcatch.com", "maildrop.cc", "maildu.de", "maileater.com", "mailexpire.com",
  "mailfall.com", "mailforspam.com", "mailinator.com", "mailinator2.com",
  "mailme.ir", "mailmetrash.com", "mailnator.com", "mailnesia.com",
  "mailnull.com", "mailo.com", "mailsac.com", "mailtemp.net", "mailshell.com",
  "mailzilla.org", "mega.zik.dj", "meltmail.com", "mintemail.com", "mobi.web.id",
  "moakt.com", "momail.com", "mozmail.com", "mrpostman.tv", "mt2009.com",
  "mytrashmail.com", "nada.email", "neverbox.com", "nincsmail.hu", "nwytg.net",
  "nwytgmail.com", "oepia.com", "oneoffmail.com", "opayq.com", "owleyes.org",
  "pig.pp.ua", "pismebe.com", "pookmail.com", "privacy.net", "proxymail.eu",
  "punkass.com", "putthisinyourspamdatabase.com", "quickinbox.com",
  "rcpt.at", "receiveee.com", "rejectmail.com", "rhyta.com", "rqtr.info",
  "sandelf.de", "scotshosting.co.uk", "sharklasers.com", "shhmail.com",
  "shittymail.org", "slaskpost.se", "slopsbox.com", "sneakemail.com",
  "spam4.me", "spambox.me", "spamgourmet.com", "spamherelots.com",
  "spamthisplease.com", "spamtrail.com", "spoofmail.de", "spraytra.com",
  "squizzy.com.au", "starpimlottery.com", "supergreatmail.com", "taskmail.de",
  "teewars.org", "temp-mail.org", "temp-mail.ru", "tempe-mail.com",
  "tempemail.net", "tempinbox.com", "temp-mail.com", "tempmail.tel",
  "tempo-mail.com", "tilippa.com", "throwawayemail.com", "tilienta.com",
  "tmail.ws", "toxenet.com", "trash-amil.com", "trash2009.com", "trashmail.at",
  "trashmail.com", "trashmail.de", "trashmail.me", "trashmail.net",
  "trashymail.com", "trayna.com", "trickmail.net", "tutanota.com", "twinmail.de",
  "tyldd.com", "uggsrock.com", "uremail.com", "veryrealemail.com",
  "viditag.com", "viewcastmedia.com", "viewcastmedia.net",
  "walmarttsc.com", "wegwerfemail.de", "wh4f.org", "whitemail.one",
  "whyspam.me", "willselfdestruct.com", "winemaven.info", "wronghead.com",
  "yopmail.com", "yopmail.fr", "yopmail.net", "yopmail.org", "zep-hyr.com",
  "zippymail.info", "zoaxe.com", "zoemail.org",
];

const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ]+(?:[ '.-][A-Za-zÀ-ÖØ-öø-ÿ]+)*$/;
const LOCAL_REGEX = /^[A-Za-z0-9._%+-]{1,64}$/;
const LABEL_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD_REGEX = /^[A-Za-z]{2,}$/;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function cleanName(name) {
  return String(name || "").trim().replace(/\s{2,}/g, " ");
}

function isValidName(name) {
  const n = cleanName(name);
  return n.length >= 2 && n.length <= 60 && NAME_REGEX.test(n);
}

function isValidEmailFormat(email) {
  if (typeof email !== "string" || email.length === 0 || email.length > 254) return false;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at >= email.length - 1) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!LOCAL_REGEX.test(local)) return false;
  if (domain.length > 253) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!LABEL_REGEX.test(label)) return false;
  }
  if (!TLD_REGEX.test(labels[labels.length - 1])) return false;
  return true;
}

function isDisposableEmail(email) {
  const at = String(email || "").lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return DISPOSABLE_DOMAINS.includes(domain);
}

function isValidPassword(password) {
  if (typeof password !== "string") return false;
  if (password.length < 8 || password.length > 72) return false;
  return /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

module.exports = {
  DISPOSABLE_DOMAINS,
  normalizeEmail,
  cleanName,
  isValidName,
  isValidEmailFormat,
  isDisposableEmail,
  isValidPassword,
};