import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Damru',
  description: 'Damru — sql2nosql: analyze PostgreSQL schemas and generate NoSQL (MongoDB) design and migration scripts.',
  base: process.env.VITEPRESS_BASE || '/',
  srcDir: '../content',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Configuration', link: '/configuration' },
      { text: 'Run migrations', link: '/run-migrations' },
      { text: 'Generator checklist', link: '/generator-checklist' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Configuration', link: '/configuration' },
          { text: 'Run migrations', link: '/run-migrations' },
          { text: 'Generator checklist', link: '/generator-checklist' },
        ],
      },
    ],
    outline: { label: 'On this page', level: [2, 3] },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/usedamru/sql2nosql' },
    ],
    footer: {
      message: 'Damru',
      copyright: 'Copyright © Damru',
    },
  },
})
