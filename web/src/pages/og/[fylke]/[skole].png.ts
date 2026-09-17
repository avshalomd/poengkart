import type { APIRoute } from 'astro';
import { loadDataset } from '../../../data';
import { slug } from '../../../helpers';
import { renderCard } from '../../../cards/card';
import { S } from '../../../state';
import type { School } from '../../../types';

export function getStaticPaths() {
  const data = loadDataset();
  S.DATA = data;
  return data.schools.map(s => ({ params: { fylke: slug(s.fylke), skole: slug(s.name) }, props: { school: s } }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderCard((props as { school: School }).school);
  // TypeScript types a bare Uint8Array over ArrayBufferLike, which a Response
  // body will not take (it could be shared memory); the wasm rasteriser hands
  // back bytes in an ordinary ArrayBuffer.
  return new Response(png as Uint8Array<ArrayBuffer>, { headers: { 'Content-Type': 'image/png' } });
};
