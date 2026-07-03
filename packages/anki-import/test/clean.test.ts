import { describe, expect, it } from 'vitest';
import { stripToPlainText } from '../src/clean.js';

describe('stripToPlainText', () => {
  it('leaves plain text untouched (just trims/collapses)', () => {
    expect(stripToPlainText('  hello   world ')).toBe('hello world');
  });

  it('removes [sound:...] media references', () => {
    expect(stripToPlainText('call off [sound:1-x.mp3]')).toBe('call off');
  });

  it('strips HTML tags without fusing words', () => {
    expect(stripToPlainText('back up<font color="#0000ff"> </font>the data')).toBe('back up the data');
    expect(stripToPlainText('a<br>b')).toBe('a b');
  });

  it('drops <img> entirely (media not supported)', () => {
    expect(stripToPlainText('<img src="x.jpg">')).toBe('');
  });

  it('decodes common HTML entities', () => {
    expect(stripToPlainText('Tom &amp; Jerry &lt;3 &#39;ok&#39; &#x263A;')).toBe("Tom & Jerry <3 'ok' ☺");
  });
});
