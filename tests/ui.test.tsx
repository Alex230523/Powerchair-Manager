import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, Button, Card, DataTable, EmptyState, Field, IconTile, KpiCard, PageHeader, Segmented, Tabs, describedBy } from "../src/components/ui";

/** Wave 13: the shared components render the expected markup, roles and states. */
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Button", () => {
  it("renders the variants, sizes, icon and loading state", () => {
    expect(html(<Button>Save</Button>)).toBe('<button class="button">Save</button>');
    expect(html(<Button variant="secondary" size="sm">Cancel</Button>)).toContain('class="button secondary sm"');
    expect(html(<Button variant="ghost">More</Button>)).toContain('class="button ghost"');
    expect(html(<Button variant="danger">Delete</Button>)).toContain('class="button danger"');
    const withIcon = html(<Button icon="players">Add</Button>);
    expect(withIcon).toContain('class="button-icon"');
    expect(withIcon).toContain("<svg");
    const loading = html(<Button loading>Sending</Button>);
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("disabled");
    expect(loading).toContain('class="button-spinner"');
    expect(loading).not.toContain("button-icon");
  });
});

describe("PageHeader", () => {
  it("has a serif title, a subtitle, actions and an optional breadcrumb", () => {
    const out = html(
      <PageHeader title="Camille" subtitle="Attaquante" crumbs={[{ label: "Joueurs", href: "/fr/players" }, { label: "Camille" }]} crumbsLabel="Fil" actions={<Button>Modifier</Button>} />,
    );
    expect(out).toContain("<h1>Camille</h1>");
    expect(out).toContain('<p class="page-subtitle">Attaquante</p>');
    expect(out).toContain('<nav class="crumbs" aria-label="Fil">');
    expect(out).toContain('<a href="/fr/players">Joueurs</a>');
    expect(out).toContain('<li aria-current="page"><span>Camille</span></li>');
    expect(out).toContain('<div class="page-actions"><button class="button">Modifier</button></div>');
  });
});

describe("Card", () => {
  it("is a titled section, a flat nested card, or a whole link", () => {
    const plain = html(
      <Card id="x" title="Titre" subtitle="Sous-titre" actions={<a href="#">Voir</a>} footer="Note">
        <p>Corps</p>
      </Card>,
    );
    expect(plain).toContain('<section id="x" class="card" aria-labelledby="x-title">');
    expect(plain).toContain('<h2 id="x-title">Titre</h2>');
    expect(plain).toContain('<p class="card-subtitle">Sous-titre</p>');
    expect(plain).toContain('<div class="card-footer">Note</div>');
    expect(plain).not.toContain("data-divider");
    expect(html(<Card flat><p>x</p></Card>)).toContain('class="card flat"');
    expect(html(<Card className="flush" title="T"><table /></Card>)).toContain("data-divider");
    const link = html(<Card title="Ouvrir" href="/fr/teams/1"><p>x</p></Card>);
    expect(link).toContain('<a class="card interactive" href="/fr/teams/1">');
    const labelled = html(<Card title="T" labelledBy="lab" headingId="lab"><p>x</p></Card>);
    expect(labelled).toContain('aria-labelledby="lab"');
    expect(labelled).toContain('<h2 id="lab">T</h2>');
  });
});

describe("Badge and IconTile", () => {
  it("maps tones, treats brand as primary and unknown values as neutral", () => {
    expect(html(<Badge tone="success" dot>OK</Badge>)).toBe('<span class="badge" data-tone="success"><span class="badge-dot" aria-hidden="true"></span>OK</span>');
    expect(html(<Badge tone="brand">x</Badge>)).toContain('data-tone="primary"');
    expect(html(<Badge tone="">x</Badge>)).toContain('data-tone="neutral"');
    expect(html(<IconTile icon="check" tone="success" />)).toContain('class="icon-tile" data-tone="success" aria-hidden="true"');
    expect(html(<IconTile icon="check" size={44} />)).toContain('data-size="lg"');
  });
});

describe("KpiCard", () => {
  it("shows the label, the figure, a description and a worded delta, as a link when given", () => {
    const out = html(<KpiCard label="Joueurs actifs" value="24" description="Sur 2 équipes" icon="players" delta={{ direction: "up", text: "+4 depuis septembre" }} href="/fr/players" />);
    expect(out).toContain('<a class="stat-card stat-link" href="/fr/players">');
    expect(out).toContain('<span class="stat-label">Joueurs actifs</span>');
    expect(out).toContain('<span class="stat-value">24</span>');
    expect(out).toContain('<span class="stat-hint">Sur 2 équipes</span>');
    expect(out).toContain('<span class="stat-delta" data-tone="success"><span aria-hidden="true">↑</span> +4 depuis septembre</span>');
    expect(html(<KpiCard label="x" value="1" hint="h" />)).toContain('<div class="stat-card">');
  });
});

describe("Tabs and Segmented", () => {
  it("renders a tablist with roving tabindex, the selected tab alone pointing at its panel", () => {
    const out = html(<Tabs label="Fiche" items={[{ id: "a", label: "A", count: 3 }, { id: "b", label: "B" }]} value="a" onChange={() => {}} idPrefix="tab" panelId={(id) => `panel-${id}`} />);
    expect(out).toContain('role="tablist" aria-label="Fiche"');
    expect(out).toContain('id="tab-a"');
    expect(out).toContain('aria-selected="true" aria-controls="panel-a" tabindex="0"');
    expect(out).toContain('aria-selected="false" tabindex="-1"');
    expect(out).not.toContain('aria-controls="panel-b"');
    expect(out).toContain('<span class="tab-count">3</span>');
    const seg = html(<Segmented label="Vue" items={[{ id: "m", label: "Mois" }, { id: "w", label: "Semaine" }]} value="w" onChange={() => {}} />);
    expect(seg).toContain('class="segmented" role="group" aria-label="Vue"');
    expect(seg).toContain('aria-pressed="true" tabindex="0"');
    expect(seg).toContain('aria-pressed="false" tabindex="-1"');
  });
});

describe("EmptyState, DataTable and Field", () => {
  it("renders an honest empty state with its tile, title, text and action", () => {
    const out = html(<EmptyState icon="players" title="Aucun joueur" text="Ajoutez un joueur." action={<Button>Ajouter</Button>} />);
    expect(out).toContain('class="icon-tile" data-tone="primary" data-size="lg"');
    expect(out).toContain('<p class="empty-title">Aucun joueur</p>');
    expect(out).toContain('<p class="empty-text">Ajoutez un joueur.</p>');
    expect(out).toContain('<div class="empty-action">');
  });
  it("dresses a table in a labelled, focusable scrolling region with a caption", () => {
    const out = html(
      <DataTable label="Joueurs" caption="Trois joueurs">
        <tbody>
          <tr>
            <td className="num">1</td>
          </tr>
        </tbody>
      </DataTable>,
    );
    expect(out).toContain('<div class="data-table table-scroll" role="region" aria-label="Joueurs" tabindex="0"><table><caption class="sr-only">Trois joueurs</caption>');
  });
  it("labels a control, with help and an error that the control can describe itself by", () => {
    const out = html(
      <Field id="email" label="Email" help="Aide" error="Erreur" required>
        <input id="email" aria-describedby={describedBy("email", true, true)} />
      </Field>,
    );
    expect(out).toContain('<div class="field has-error"><label for="email">Email<span class="field-required" aria-hidden="true"> *</span></label>');
    expect(out).toContain('aria-describedby="email-help email-error"');
    expect(out).toContain('<p class="field-help" id="email-help">Aide</p>');
    expect(out).toContain('<p class="field-error" id="email-error">');
    expect(describedBy("x")).toBeUndefined();
  });
});
