import { getPermalink, getBlogPermalink, getAsset } from './utils/permalinks';

export const headerData = {
  links: [
    {
      text: 'Leistungen',
      href: getPermalink('/leistungen/'),
    },
    {
      text: 'Blog',
      href: getPermalink('/blog/'),
    },
    {
      text: 'Kontakt',
      href: getPermalink('/kontakt/'),
    },
  ],
  actions: [
    {
      text: 'Jetzt anrufen',
      href: 'tel:+4921917932020',
      variant: 'primary',
      icon: 'tabler:phone',
    },
    {
      text: 'WhatsApp',
      href: 'https://wa.me/4921917932020?text=Hallo%2C%20ich%20hatte%20einen%20Unfall.%0AName%3A%20%0APLZ%2FOrt%3A%20%0AErreichbar%20um%3A%20%0AUnfallzeit%3A%20%0AKurzbeschreibung%3A%20',
      variant: 'secondary',
      target: '_blank',
      icon: 'tabler:brand-whatsapp',
    },
    {
      text: 'Schaden melden',
      href: getPermalink('/schaden-melden/'),
      variant: 'primary',
      class: 'btn-primary-brand',
    },
  ],
};

export const footerData = {
  links: [
    {
      title: 'Kontakt',
      links: [
        { text: 'Telefon: +49 2191 7932020', href: 'tel:+4921917932020' },
        { text: 'E-Mail: info@schaden-check24.de', href: 'mailto:info@schaden-check24.de' },
        { text: 'WhatsApp', href: 'https://wa.me/4921917932020?text=Hallo%2C%20ich%20hatte%20einen%20Unfall.%0AName%3A%20%0APLZ%2FOrt%3A%20%0AErreichbar%20um%3A%20%0AUnfallzeit%3A%20%0AKurzbeschreibung%3A%20' },
      ],
    },
    {
      title: 'Adresse',
      links: [
        { text: 'K&ouml;lner Str. 121', href: getPermalink('/kontakt/') },
        { text: '42897 Remscheid', href: getPermalink('/kontakt/') },
      ],
    },
    {
      title: 'Gutachten',
      links: [
        { text: 'Unfallgutachten', href: getPermalink('/kfz-unfallgutachten/') },
        { text: 'Haftpflichtgutachten', href: getPermalink('/haftpflichtgutachten/') },
        { text: 'Schadensgutachten', href: getPermalink('/schadensgutachten/') },
        { text: 'Wertgutachten', href: getPermalink('/wertgutachten/') },
        { text: 'Kurzgutachten', href: getPermalink('/kurzgutachten/') },
        { text: 'Beweissicherung', href: getPermalink('/beweissicherungsgutachten/') },
      ],
    },
    {
      title: 'Service',
      links: [
        { text: 'Unsere Leistungen', href: getPermalink('/leistungen/') },
        { text: 'Blog', href: getPermalink('/blog/') },
        { text: 'Schaden melden', href: getPermalink('/schaden-melden/') },
        { text: 'Kontakt', href: getPermalink('/kontakt/') },
      ],
    },
  ],
  secondaryLinks: [
    { text: 'Impressum', href: getPermalink('/impressum/') },
    { text: 'Datenschutz', href: getPermalink('/datenschutz/') },
  ],
  socialLinks: [],
  footNote: `
    &copy; ${new Date().getFullYear()} KFZ Gutachter Remscheid &amp; KFZ Sachverst&auml;ndiger Unfallgutachten bei SchadenCheck &middot; Alle Rechte vorbehalten. &middot;
    Umgesetzt durch
    <a class="hover:underline" href="https://www.bergisch-digital-agentur.de/">bergisch-digital-agentur.de</a>
  `,
};

