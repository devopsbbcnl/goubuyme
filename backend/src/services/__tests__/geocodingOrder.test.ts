import { nominatimFirst } from '../geocoding.service';

const PUBLIC = 'https://nominatim.openstreetmap.org';

describe('nominatimFirst', () => {
  it('asks MapTiler first when the public OSM server would otherwise receive customer addresses', () => {
    expect(nominatimFirst({ MAPTILER_API_KEY: 'k' } as NodeJS.ProcessEnv, PUBLIC)).toBe(false);
  });
  it('keeps public Nominatim first when there is no MapTiler key to fall back on', () => {
    expect(nominatimFirst({} as NodeJS.ProcessEnv, PUBLIC)).toBe(true);
  });
  it('keeps a self-hosted Nominatim first (data stays in-house)', () => {
    expect(nominatimFirst({ MAPTILER_API_KEY: 'k' } as NodeJS.ProcessEnv, 'http://localhost:8080')).toBe(true);
  });
  it('can be forced either way', () => {
    expect(nominatimFirst({ GEOCODER_PRIMARY: 'nominatim', MAPTILER_API_KEY: 'k' } as NodeJS.ProcessEnv, PUBLIC)).toBe(true);
    expect(nominatimFirst({ GEOCODER_PRIMARY: 'maptiler' } as NodeJS.ProcessEnv, 'http://localhost:8080')).toBe(false);
  });
});
