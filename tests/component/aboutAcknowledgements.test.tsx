/**
 * BTECH provided the DA-7X2 this project's support for it is built on, and
 * asked for one thing in return: their name, linked, in the README and on the
 * About page. This keeps the About half of that from being dropped by accident.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AboutTab } from '../../src/components/about/AboutTab';

describe('About › Acknowledgements', () => {
  it('credits BTECH Radios, linked to the DA-7X2', () => {
    const html = renderToStaticMarkup(<AboutTab />);
    expect(html).toContain('Acknowledgements');
    expect(html).toMatch(/<a href="https:\/\/baofengtech\.com\/product\/da-7x2\/"[^>]*>BTECH Radios<\/a>/);
  });
});
