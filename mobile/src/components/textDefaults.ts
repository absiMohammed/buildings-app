import { I18nManager, Text } from 'react-native';

// Project convention: every Text in the app is left-aligned, including
// Arabic. Glyphs still read right-to-left within a line — only the block
// alignment is anchored to the visual left edge.
//
// Text.defaultProps.style does NOT work here: as soon as a caller passes
// `style={...}` on the JSX, defaultProps.style is replaced entirely (no
// merge). Patching Text.render is the only way to inject a base style
// that callers' styles still override-on-top of.
type Renderable = { render?: (...args: unknown[]) => unknown };
const TextWithRender = Text as unknown as Renderable;
const origRender = TextWithRender.render;
if (origRender && !(TextWithRender as { __baTextPatched?: boolean }).__baTextPatched) {
  const base = {
    textAlign: 'left' as const,
    writingDirection: I18nManager.isRTL ? ('rtl' as const) : ('ltr' as const),
  };
  TextWithRender.render = function patched(this: unknown, ...args: unknown[]) {
    const [props, ref] = args as [{ style?: unknown } & Record<string, unknown>, unknown];
    const merged = { ...props, style: [base, props?.style] };
    return origRender.call(this, merged, ref);
  };
  (TextWithRender as { __baTextPatched?: boolean }).__baTextPatched = true;
}
