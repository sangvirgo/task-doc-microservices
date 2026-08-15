import { SecurityClient } from '../src/security/security.client';

describe('SecurityClient preview timeout', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('allows a slow office preview to finish beyond the normal security timeout', async () => {
    jest.useFakeTimers();
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation((_input, init) =>
      new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        setTimeout(
          () =>
            resolve(
              new Response(
                JSON.stringify({
                  preview_id: '00000000-0000-4000-8000-000000000001',
                  page_count: 1,
                  mime_type: 'image/png',
                  expires_at: '2026-08-15T15:00:00.000Z',
                }),
                { status: 201, headers: { 'content-type': 'application/json' } },
              ),
            ),
          10_000,
        );
      }),
    );

    const config = {
      get: (key: string) =>
        ({
          DOCUMENT_SECURITY_URL: 'http://security',
          SECURITY_TIMEOUT_MS: 5_000,
          PREVIEW_TIMEOUT_MS: 60_000,
        })[key],
    };
    const client = new SecurityClient(config as never);
    const resultPromise = client.preparePreview({
      document_id: '00000000-0000-4000-8000-000000000002',
      version: 1,
      actor_label: 'alice@example.test',
      session_id: '00000000-0000-4000-8000-000000000003',
    });

    await jest.advanceTimersByTimeAsync(10_000);

    await expect(resultPromise).resolves.toMatchObject({ page_count: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
