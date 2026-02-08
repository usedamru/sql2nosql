import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'sql2nosql',
  description: 'Analyze PostgreSQL schemas and generate NoSQL (MongoDB) design and migration scripts.',
  base: process.env.VITEPRESS_BASE || '/',
  srcDir: '../content',
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Run migrations', link: '/run-migrations' },
      { text: 'Generator checklist', link: '/generator-checklist' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Run migrations', link: '/run-migrations' },
          { text: 'Generator checklist', link: '/generator-checklist' },
        ],
      },
    ],
    outline: { label: 'On this page', level: [2, 3] },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/data-migration/sql2nosql' },
    ],
    footer: {
      message: 'Generated with VitePress',
      copyright: 'Copyright © sql2nosql',
    },
  },
})
