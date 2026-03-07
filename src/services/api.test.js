import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSchedule, fetchStandings } from './api';

describe('api', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    it('fetchSchedule(league) calls fetch with URL containing league param', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

        await fetchSchedule('wbc');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/schedule');
        expect(url).toContain('league=wbc');
    });

    it('fetchStandings(league) calls fetch with URL containing league param', async () => {
        const mockFetch = vi.mocked(fetch);
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ records: [] }) });

        await fetchStandings('lidom');

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/standings');
        expect(url).toContain('league=lidom');
    });
});
