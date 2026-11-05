import { compareVersions, releaseNotesUpTo, unseenReleaseNotes } from './whats-new';

const NOTES = [
  { version: '1.0.63', date: '', notes: ['a'] },
  { version: '1.0.65', date: '', notes: ['c'] },
  { version: '1.0.64', date: '', notes: ['b'] },
];

describe('whats new', () => {
  it('compares versions number by number', () => {
    expect(compareVersions('1.0.65', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.65', '1.0.65')).toBe(0);
    expect(compareVersions('1.1', '1.0.99')).toBeGreaterThan(0);
  });

  it('shows every missed release up to the installed one, newest first', () => {
    expect(unseenReleaseNotes('1.0.65', '1.0.62', NOTES).map((item) => item.version)).toEqual(['1.0.65', '1.0.64', '1.0.63']);
    expect(unseenReleaseNotes('1.0.64', '1.0.63', NOTES).map((item) => item.version)).toEqual(['1.0.64']);
  });

  it('shows nothing on a first install, or when already seen', () => {
    expect(unseenReleaseNotes('1.0.65', null, NOTES)).toEqual([]);
    expect(unseenReleaseNotes('1.0.65', '1.0.65', NOTES)).toEqual([]);
  });

  it('lists all notes up to the installed version for Settings', () => {
    expect(releaseNotesUpTo('1.0.64', NOTES).map((item) => item.version)).toEqual(['1.0.64', '1.0.63']);
  });
});
