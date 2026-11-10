/**
 * A release day as a calendar invite (.ics).
 *
 * Served by the Worker as text/calendar, which is what makes an iPhone show
 * its "Add to Calendar" sheet and a Mac open Calendar - a file built in the
 * page and downloaded does neither reliably on iOS. Pure, so it is tested
 * without a server.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** RFC 5545 text: escape the characters that carry meaning in a value. */
const escapeText = (s) => String(s ?? '')
  .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/**
 * Fold lines longer than 75 octets, as the format requires. Counting bytes
 * rather than characters matters: a title in Japanese or with an emoji would
 * otherwise be split mid-character and arrive as garbage.
 */
function fold(line) {
  const bytes = new TextEncoder();
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = bytes.encode(ch).length;
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  out.push(current);
  return out.join('\r\n ');
}

const compact = (iso) => iso.replace(/-/g, '');

function nextDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object} release
 * @param {string} release.id     Hardcover book id - keeps the event's identity
 *                                stable, so adding it again after a date change
 *                                updates the event instead of duplicating it
 * @param {string} release.title
 * @param {string} release.date   YYYY-MM-DD
 * @param {string} [release.by]      author(s)
 * @param {string} [release.series]  e.g. "The Stormlight Archive #6"
 * @param {string} [release.link]    a page about the book
 */
export function releaseInvite({ id, title, date, by, series, link }, now = new Date()) {
  if (!ISO_DATE.test(date ?? '')) throw new Error('A release needs a full date (YYYY-MM-DD).');
  if (!title) throw new Error('A release needs a title.');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const about = [series, by ? `by ${by}` : null].filter(Boolean).join(' ');
  const description = [
    about ? `${title} — ${about}.` : `${title}.`,
    'Added from Bookshelf.',
  ].join(' ');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bookshelf//Release days//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:release-${String(id ?? title).replace(/[^\w-]/g, '')}@bookshelf`,
    `DTSTAMP:${stamp}`,
    // An all-day event: a release has a day, not a time.
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
    `SUMMARY:${escapeText(`📚 ${title} is out`)}`,
    `DESCRIPTION:${escapeText(description)}`,
    link ? `URL:${link}` : null,
    // Free, not busy: a book coming out shouldn't block the day.
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(`${title} is out today`)}`,
    // 9am on the day - all-day events start at midnight.
    'TRIGGER:PT9H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.map(fold).join('\r\n')}\r\n`;
}

const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * A club meeting as a calendar invite. The time is the club's local time as
 * chosen ("floating", no time zone), which is how people agree a meeting.
 *
 * @param {object} m
 * @param {string} m.id       the meeting's id, so re-adding updates it
 * @param {string} m.club     the club's name
 * @param {string} m.start    YYYY-MM-DDTHH:MM
 * @param {string} [m.place]  an address or a video link
 * @param {string} [m.book]   what the club is reading
 */
export function meetingInvite({ id, club, start, place, book }, now = new Date()) {
  if (!LOCAL_TIME.test(start ?? '')) throw new Error('A meeting needs a date and time.');
  if (!club) throw new Error('A meeting needs a club.');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const at = (iso) => `${iso.replace(/[-:]/g, '')}00`;
  const end = new Date(`${start}:00Z`);
  end.setUTCMinutes(end.getUTCMinutes() + 90);
  const isLink = /^https:\/\//.test(place ?? '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookshelf//Club meetings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:meeting-${String(id ?? start).replace(/[^\w-]/g, '')}@bookshelf`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${at(start)}`,
    `DTEND:${at(end.toISOString().slice(0, 16))}`,
    `SUMMARY:${escapeText(`📚 ${club}${book ? ` — ${book}` : ''}`)}`,
    `DESCRIPTION:${escapeText(`Book club meeting${book ? ` about ${book}` : ''}. Added from Bookshelf.`)}`,
    place && !isLink ? `LOCATION:${escapeText(place)}` : null,
    place && isLink ? `URL:${place}` : null,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`${club} meets in an hour`)}`, 'TRIGGER:-PT1H', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean);
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
