import type { MetadataRoute } from "next";

/**
 * Keep the board out of search results.
 *
 * This is a link somebody forwards into a group chat, not a place anybody
 * should arrive at from a search for a person's name. The wall carries
 * anonymous, unverified claims about real people, published the second they
 * are written, with no review and no way for the person being talked about to
 * know it is there. Indexing that attaches it to their name permanently and
 * for an audience the product was never for.
 *
 * PRODUCT.md is explicit that reach is "a friend group first, then whoever
 * they forward the link to". Search is not on that list.
 *
 * This is a request, not a control: crawlers that ignore robots.txt are
 * unaffected, and the board stays fully public to anyone with the URL.
 * Deleting this file is all it takes to reverse.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
