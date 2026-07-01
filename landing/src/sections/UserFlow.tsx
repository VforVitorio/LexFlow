import { useTranslation } from 'react-i18next';
import { SectionEyebrow } from '../components/SectionEyebrow';

/**
 * #183 — "Cómo lo usas" / "How you use it".
 *
 * Three-step user flow that purposefully avoids any technical vocabulary
 * (no `uv sync`, no MCP tools, no endpoint names). Each step is one
 * sentence about what the user does, paired with a bullet of what
 * happens behind the scenes — phrased in human terms.
 *
 * The technical equivalent (parser → graph → chat with MCP tools) still
 * exists in `HowItWorks.tsx` but lives under the "Para desarrolladores"
 * dev-tone wrapper after #184.
 */

interface Step {
  num: string;
  title: string;
  body: string;
  bullet: string;
}

export function UserFlow() {
  const { t } = useTranslation('landing');
  const steps = t('userFlow.steps', { returnObjects: true }) as unknown as Step[];

  return (
    <section id="how-you-use" className="tight">
      <div className="lf-container">
        <SectionEyebrow label={t('userFlow.eyebrow')} />
        <h2 className="section-title">{t('userFlow.title')}</h2>
        <p className="section-sub">{t('userFlow.sub')}</p>
        <ol className="user-flow-grid">
          {steps.map((s) => (
            <li key={s.num} className="user-flow-step spotlight-card">
              <div className="user-flow-num feature-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <div className="user-flow-bullet">{s.bullet}</div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
