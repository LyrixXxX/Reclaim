import { createLocalStateWriter, readLocalState, SaveStatus } from './local-storage';

const snapshot = JSON.stringify({ trackers: [], checkIns: [], nutritionEntries: [{ id: 'existing' }] });

describe('safe local history loading', () => {
  it('only treats a missing key as a new install', async () => {
    await expect(readLocalState(async () => null)).resolves.toBeNull();
    await expect(readLocalState(async () => snapshot)).resolves.toEqual(JSON.parse(snapshot));
  });

  it.each(['', '{broken', 'null', '{}', '{"trackers":[],"checkIns":null}'])('rejects unreadable history without writing starter data: %s', async (stored) => {
    const write = jest.fn();
    await expect((async () => {
      const state = await readLocalState(async () => stored);
      await write(state);
    })()).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps a read failure distinct from missing history and allows retry', async () => {
    const read = jest.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(snapshot);
    await expect(readLocalState(read)).rejects.toThrow('unavailable');
    await expect(readLocalState(read)).resolves.toHaveProperty('nutritionEntries', [{ id: 'existing' }]);
  });
});

describe('ordered local saves', () => {
  it('waits for the current write before writing the next snapshot', async () => {
    let finish!: () => void;
    const write = jest.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
    const report = jest.fn();
    const writer = createLocalStateWriter(write, report);
    const first = writer.save('old');
    const second = writer.save('new');
    await Promise.resolve();
    expect(write.mock.calls).toEqual([['old']]);
    finish();
    await first;
    expect(report).not.toHaveBeenCalledWith('saved');
    await second;
    expect(write.mock.calls).toEqual([['old'], ['new']]);
    expect(report).toHaveBeenLastCalledWith('saved');
  });

  it('exposes failure and retries the latest snapshot, not older disk data', async () => {
    const write = jest.fn().mockRejectedValueOnce(new Error('full')).mockRejectedValueOnce(new Error('full')).mockResolvedValue(undefined);
    const statuses: SaveStatus[] = [];
    const writer = createLocalStateWriter(write, (status) => statuses.push(status));
    await expect(writer.save('first edit')).rejects.toThrow();
    await expect(writer.save('latest edit')).rejects.toThrow();
    expect(statuses.at(-1)).toBe('error');
    expect(write).toHaveBeenCalledTimes(2);
    await writer.retry();
    expect(write.mock.calls).toEqual([['first edit'], ['latest edit'], ['latest edit']]);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('does not let a stale failure override a newer queued save', async () => {
    const write = jest.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue(undefined);
    const report = jest.fn();
    const writer = createLocalStateWriter(write, report);
    const first = writer.save('old').catch(() => undefined);
    const latest = writer.save('new');
    await Promise.all([first, latest]);
    expect(report).not.toHaveBeenCalledWith('error');
    expect(report).toHaveBeenLastCalledWith('saved');
  });

  it('does not report a pending restore as saved', async () => {
    let reject!: (error: Error) => void;
    const report = jest.fn();
    const writer = createLocalStateWriter(() => new Promise<void>((_, fail) => { reject = fail; }), report);
    const restoring = writer.save(snapshot);
    await Promise.resolve();
    expect(report).toHaveBeenLastCalledWith('saving');
    reject(new Error('disk full'));
    await expect(restoring).rejects.toThrow('disk full');
    expect(report).toHaveBeenLastCalledWith('error');
  });

  it('does not write anything on retry before a snapshot exists', async () => {
    const write = jest.fn();
    await createLocalStateWriter(write, jest.fn()).retry();
    expect(write).not.toHaveBeenCalled();
  });

  it('does not retry a failed permanent deletion after the user is told it failed', async () => {
    const write = jest.fn().mockRejectedValueOnce(new Error('disk full'));
    const writer = createLocalStateWriter(write, jest.fn());
    await expect(writer.save('deleted tracker snapshot')).rejects.toThrow('disk full');
    writer.forgetFailedSnapshot('deleted tracker snapshot');
    await writer.retry();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('finishes a pending save without notifying an unmounted consumer', async () => {
    let finish!: () => void;
    const report = jest.fn();
    const writer = createLocalStateWriter(() => new Promise<void>((resolve) => { finish = resolve; }), report);
    const saving = writer.save(snapshot);
    await Promise.resolve();
    writer.setReporting(false);
    finish();
    await saving;
    expect(report.mock.calls).toEqual([['saving']]);
  });
});
