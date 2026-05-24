/**
 * macOS-style window chrome shared by every SPA preview card.
 *
 * Three traffic-light dots on the left, an app-tab pill centred with the
 * preview's title, optional URL-bar slot on the right. Visual goal: make
 * each preview read as a screenshot of the actual app rather than as a
 * dashboard widget. Same idiom Linear, Cron, Raycast and friends use on
 * their feature cards.
 *
 * --- WHERE TO CHANGE IF X CHANGES ---
 * Styles: landing/src/landing.css   .lf-prev-chrome / .lf-prev-traffic /
 *                                   .lf-prev-tab
 */

interface Props {
  /** Tab label shown in the centre. Keep short — gets ellipsised under ~28 ch. */
  title: string;
}

export function PreviewChrome({ title }: Props) {
  return (
    <div className="lf-prev-chrome" aria-hidden="true">
      <span className="lf-prev-traffic">
        <span className="lf-prev-traffic-dot is-close" />
        <span className="lf-prev-traffic-dot is-min" />
        <span className="lf-prev-traffic-dot is-max" />
      </span>
      <span className="lf-prev-tab">{title}</span>
    </div>
  );
}
