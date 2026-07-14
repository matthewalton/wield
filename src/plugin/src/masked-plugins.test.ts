import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { MASKING_ISSUE_URL, maskedPluginsSection } from "./masked-plugins.ts";

const settings = (enabledPlugins: Record<string, boolean>) => JSON.stringify({ enabledPlugins });

describe("[PLUGIN-18] doctor reports each enabled non-official plugin as masked on metrics", () => {
  it("one warning line per enabled non-official plugin, naming it", () => {
    const lines = maskedPluginsSection(
      settings({ "speccle@speccle-marketplace": true, "baton@baton": true }),
    );
    const speccle = lines.filter((line) => line.includes("speccle@speccle-marketplace"));
    assert.equal(speccle.length, 1);
    assert.match(speccle[0]!, /third-party/);
    const baton = lines.filter((line) => line.includes("baton@baton"));
    assert.equal(baton.length, 1);
  });

  it("the section surfaces the upstream issue URL when it warns", () => {
    const lines = maskedPluginsSection(settings({ "speccle@speccle-marketplace": true }));
    assert.ok(lines.some((line) => line.includes(MASKING_ISSUE_URL)));
    assert.equal(MASKING_ISSUE_URL, "https://github.com/anthropics/claude-code/issues/77541");
  });

  it("a missing settings file reads as no enabled plugins, one informational line", () => {
    const lines = maskedPluginsSection(null);
    assert.equal(lines.length, 1);
    // Informational means it names the settings file, not a bare none-line.
    assert.match(lines[0]!, /settings file/);
    assert.doesNotMatch(lines.join("\n"), /third-party/);
  });

  it("an unreadable settings file likewise, never a stack trace", () => {
    const lines = maskedPluginsSection("{not json");
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /settings file/);
    assert.doesNotMatch(lines.join("\n"), /^\s+at /m);
  });
});

describe("[PLUGIN-19] official-marketplace and disabled plugins produce no masking warning", () => {
  it("claude-plugins-official plugins report verbatim, so no warning", () => {
    const lines = maskedPluginsSection(
      settings({
        "code-review@claude-plugins-official": true,
        "speccle@speccle-marketplace": true,
      }),
    );
    assert.ok(!lines.some((line) => line.includes("code-review@claude-plugins-official")));
    assert.ok(lines.some((line) => line.includes("speccle@speccle-marketplace")));
  });

  it("a disabled plugin loads no skills, so no warning", () => {
    const lines = maskedPluginsSection(settings({ "speccle@speccle-marketplace": false }));
    assert.ok(!lines.some((line) => line.includes("speccle@speccle-marketplace")));
  });

  it("only official and disabled entries yields the none-line", () => {
    const lines = maskedPluginsSection(
      settings({
        "code-review@claude-plugins-official": true,
        "speccle@speccle-marketplace": false,
      }),
    );
    assert.equal(lines.length, 1);
    assert.match(lines[0]!, /none/);
  });
});
