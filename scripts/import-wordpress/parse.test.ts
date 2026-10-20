import { readFileSync } from 'node:fs';
import type { Term } from '@vinyl/shared';
import { beforeAll, describe, expect, it } from 'vite-plus/test';
import { parseWpPost, termsOf, type WpPost, type WpTerm } from './parse.ts';

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

describe('parseWpPost', () => {
  let posts: WpPost[];
  let categories: Map<number, Term>;
  let tags: Map<number, Term>;

  const parse = (slug: string) => {
    const wp = posts.find((post) => post.slug === slug);
    if (!wp) throw new Error(`fixture missing: ${slug}`);
    return parseWpPost(wp, categories, tags);
  };

  beforeAll(() => {
    posts = fixture<WpPost[]>('posts-sample.json');
    categories = termsOf(fixture<WpTerm[]>('categories.json'));
    tags = termsOf(fixture<WpTerm[]>('tags.json'));
  });

  it('parses the Bowie post with a decoded slug and title', () => {
    const post = parse('david-bowie-%e2%98%85');
    expect(post.slug).toBe('david-bowie-★');
    expect(post.title).toBe('david bowie – ★');
    expect(post.categorySlug).toBe('vinyl');
    expect(post.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.discogsUrl).toBeUndefined();
    expect(post.text).toBeUndefined();
    expect(post.imageUrls.length).toBeGreaterThanOrEqual(5);
    expect(post.imageUrls[0]).toBe('https://vinyl.rehab/wp-content/uploads/2026/01/DSCF2087.jpg');
    expect(post.imageUrls.some((url) => /-\d+x\d+\./.test(url))).toBe(false);
    expect(new Set(post.imageUrls).size).toBe(post.imageUrls.length);
  });

  it('extracts the discogs link and keeps it out of the text', () => {
    const post = parse('ajukaja-ats-soome-papp');
    expect(post.discogsUrl).toBe('https://www.discogs.com/release/25623145-Ajukaja-Ats-Soome-Papp');
    expect(post.text).toBeUndefined();
    expect(post.imageUrls).toHaveLength(2);
    expect(post.tagSlugs.length).toBe(2);
    expect(post.wpId).toBe(883);
  });

  it('takes the category from the link, not the first category id', () => {
    expect(parse('supersilent-14').categorySlug).toBe('uncategorized');
    const wp = posts.find((post) => post.slug === 'supersilent-14')!;
    const relinked = { ...wp, link: 'https://vinyl.rehab/vinyl/supersilent-14/' };
    expect(parseWpPost(relinked, categories, tags).categorySlug).toBe('vinyl');
  });

  it('falls back to the first category id when the link segment is unknown', () => {
    const wp = posts.find((post) => post.slug === 'supersilent-14')!;
    const odd = { ...wp, link: 'https://vinyl.rehab/nope/supersilent-14/' };
    expect(parseWpPost(odd, categories, tags).categorySlug).toBe('uncategorized');
  });

  it('keeps paragraph text from the cassette post', () => {
    const post = parse('maria-w-horn-mats-erlandsson-ytterlannas-gamla-kyrka-organ-rehearsal-tape');
    expect(post.categorySlug).toBe('cassette');
    expect(post.text).toContain('Limited edition of 150 clear cassette');
    expect(post.text).not.toContain('<');
    expect(post.discogsUrl).toContain('discogs.com/release/32617641');
  });

  it('decodes tag names', () => {
    const quote = fixture<WpTerm[]>('tags.json').find((tag) => tag.id === 119)!;
    expect(termsOf([quote]).get(119)).toEqual({ slug: '12-2', name: '12"' });
  });

  it('reads classic-editor images that are not wrapped in a figure', () => {
    const upload = 'https://vinyl.rehab/wp-content/uploads/2017/10';
    const wp: WpPost = {
      id: 60,
      date: '2017-10-20T10:00:00',
      slug: 'technics-sl-1900',
      link: 'https://vinyl.rehab/vinyl/technics-sl-1900/',
      title: { rendered: 'technics' },
      content: {
        rendered:
          `<p><img class="aligncenter" src="${upload}/DSC_4935.jpg" width="2000" /> ` +
          `<a href="${upload}/DSC_4936.jpg"><img src="${upload}/DSC_4936-300x200.jpg" /></a></p>` +
          `<p><img src="https://s.w.org/images/core/emoji/smile.svg" /></p><p>Nice deck</p>`,
      },
      categories: [5],
      tags: [],
    };
    const post = parseWpPost(wp, categories, tags);
    expect(post.imageUrls).toEqual([`${upload}/DSC_4935.jpg`, `${upload}/DSC_4936.jpg`]);
    expect(post.text).toBe('Nice deck');
  });

  it('reads an anchor-wrapped classic image between text and ignores non-uploads images', () => {
    const upload = 'https://vinyl.rehab/wp-content/uploads/2018/03';
    const wp: WpPost = {
      id: 61,
      date: '2018-03-01T10:00:00',
      slug: 'classic',
      link: 'https://vinyl.rehab/vinyl/classic/',
      title: { rendered: 'classic' },
      content: {
        rendered:
          `<p>Before <a href="${upload}/big.jpg"><img src="${upload}/big-1024x768.jpg" /></a> after</p>` +
          '<p><img src="https://s.w.org/images/core/emoji/14/72x72/1f600.png" alt="" /></p>' +
          '<p><a href="https://example.com/page"><img src="https://example.com/banner.jpg" /></a></p>',
      },
      categories: [5],
      tags: [],
    };
    const post = parseWpPost(wp, categories, tags);
    expect(post.imageUrls).toEqual([`${upload}/big.jpg`]);
    expect(post.text).toBe('Before  after');
  });

  describe('discogs links and other anchors (real WP posts)', () => {
    let edge: WpPost[];
    const parseEdge = (id: number) => {
      const wp = edge.find((post) => post.id === id);
      if (!wp) throw new Error(`fixture missing: ${id}`);
      return parseWpPost(wp, categories, tags);
    };

    beforeAll(() => {
      edge = fixture<WpPost[]>('posts-edge-cases.json');
    });

    it('takes a discogs link that sits inside a text paragraph', () => {
      const post = parseEdge(488);
      expect(post.discogsUrl).toBe(
        'https://www.discogs.com/Mika-Vainio-Lydspor-One-Two/release/12146720',
      );
      expect(post.text).toBe('Mika Vainio ‎– Lydspor One & Two');
    });

    it('takes the first of several discogs links and keeps the rest as Markdown links', () => {
      const post = parseEdge(468);
      expect(post.discogsUrl).toBe('https://www.discogs.com/Levels-Levels/release/11079816');
      expect(post.text).toBe(
        [
          'Level – Levels',
          'Maymind – Illumina [[discogs]](https://www.discogs.com/Maymind-Illumina/release/11103868)',
          'Mikrovold – I [[discogs]](https://www.discogs.com/Mikrovolt-I/master/1296118)',
          'TüTh!!!!! – Transgression [[discogs]](https://www.discogs.com/T%C3%BCTH-Transgression/release/11121499)',
        ].join('\n\n'),
      );
    });

    it('reads list items and drops the item that only held the discogs link', () => {
      const post = parseEdge(386);
      expect(post.discogsUrl).toBe('https://www.discogs.com/Lush-Mad-Love/release/397504');
      expect(post.text).toBe(
        [
          '- [Lush – Sweetness and Light [4AD – BAD 0013]](https://www.discogs.com/Lush-Sweetness-And-Light/release/544410)',
          '- [Lush – Scar [4AD – JAD 911]](https://www.discogs.com/Lush-Scar/release/313920)',
        ].join('\n'),
      );
    });

    it('drops a paragraph that only held the bracketed discogs link', () => {
      const post = parseEdge(361);
      expect(post.discogsUrl).toBe(
        'https://www.discogs.com/Oliver-Coates-John-Luther-Adams-Canticles-Of-The-Sky/release/11897603',
      );
      expect(post.text).toBeUndefined();
    });

    it('keeps the fallback link of an embedded player next to the discogs link', () => {
      const post = parseEdge(238);
      expect(post.discogsUrl).toBe(
        'https://www.discogs.com/Motion-Sickness-Of-Time-Travel-Ballades/release/6071265',
      );
      expect(post.text).toBe(
        '[Ballades by Motion Sickness of Time Travel](http://motionsicknessoftimetravel.bandcamp.com/album/ballades)',
      );
    });

    it('uses the slug as the title when the WP title is empty', () => {
      const post = parseEdge(100);
      expect(post.title).toBe('100');
      expect(post.imageUrls.length).toBeGreaterThan(0);
    });
  });

  it('converts non-discogs links in text to Markdown links', () => {
    const wp: WpPost = {
      id: 62,
      date: '2018-03-01T10:00:00',
      slug: 'linked',
      link: 'https://vinyl.rehab/vinyl/linked/',
      title: { rendered: 'linked' },
      content: {
        rendered:
          '<p>Listen on <a href="https://example.bandcamp.com/album/x?a=1&amp;b=2">Bandcamp &amp; more</a>.</p>' +
          '<p><a href="https://www.discogs.com/release/1">discogs</a></p>',
      },
      categories: [5],
      tags: [],
    };
    const post = parseWpPost(wp, categories, tags);
    expect(post.discogsUrl).toBe('https://www.discogs.com/release/1');
    expect(post.text).toBe(
      'Listen on [Bandcamp & more](https://example.bandcamp.com/album/x?a=1&b=2).',
    );
  });
});
