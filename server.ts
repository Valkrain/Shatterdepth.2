import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock repository database for robust offline/rate-limit fallback
  const mockRepos: Record<string, any> = {
    'facebook/react': {
      id: 10270250,
      name: 'react',
      full_name: 'facebook/react',
      description: 'The library for web and native user interfaces',
      html_url: 'https://github.com/facebook/react',
      stargazers_count: 228000,
      forks_count: 45000,
      open_issues_count: 1200,
      default_branch: 'main',
      language: 'JavaScript',
      license: { name: 'MIT License' },
      topics: ['ui', 'frontend', 'declarative', 'javascript'],
      tree: [
        { path: 'package.json', type: 'blob', size: 1200 },
        { path: 'README.md', type: 'blob', size: 3400 },
        { path: 'src', type: 'tree' },
        { path: 'src/index.js', type: 'blob', size: 450 },
        { path: 'src/React.js', type: 'blob', size: 2100 },
        { path: 'compiler', type: 'tree' },
        { path: 'compiler/README.md', type: 'blob', size: 850 }
      ],
      files: {
        'package.json': JSON.stringify({
          name: 'react',
          version: '19.0.0',
          description: 'React is a JavaScript library for building user interfaces.',
          main: 'index.js',
          dependencies: {
            scheduler: '^0.23.2'
          },
          devDependencies: {
            jest: '^29.0.0',
            rollup: '^4.0.0'
          }
        }, null, 2),
        'README.md': `# React \n\nReact is a JavaScript library for building user interfaces.\n\n- **Declarative**: React makes it painless to create interactive UIs.\n- **Component-Based**: Build encapsulated components that manage their own state.\n- **Learn Once, Write Anywhere**: Develop new features without rewriting existing code.`,
        'src/index.js': `import { createRoot } from 'react-dom/client';\nimport App from './App';\n\nconsole.log('React initialized');`,
        'src/React.js': `export function createElement(type, props, ...children) {\n  return { type, props, children };\n}`
      }
    },
    'tailwindlabs/tailwindcss': {
      id: 25838048,
      name: 'tailwindcss',
      full_name: 'tailwindlabs/tailwindcss',
      description: 'A utility-first CSS framework for rapid UI development.',
      html_url: 'https://github.com/tailwindlabs/tailwindcss',
      stargazers_count: 81000,
      forks_count: 4200,
      open_issues_count: 350,
      default_branch: 'next',
      language: 'TypeScript',
      license: { name: 'MIT License' },
      topics: ['css', 'tailwind', 'design-systems', 'postcss'],
      tree: [
        { path: 'package.json', type: 'blob', size: 1500 },
        { path: 'README.md', type: 'blob', size: 5200 },
        { path: 'src', type: 'tree' },
        { path: 'src/index.ts', type: 'blob', size: 620 },
        { path: 'src/plugin.ts', type: 'blob', size: 1400 }
      ],
      files: {
        'package.json': JSON.stringify({
          name: 'tailwindcss',
          version: '4.0.0',
          description: 'A utility-first CSS framework for rapid UI development.',
          main: 'dist/index.js',
          dependencies: {
            'postcss': '^8.4.0'
          }
        }, null, 2),
        'README.md': `# Tailwind CSS\n\nTailwind CSS is a utility-first CSS framework packed with classes that can be composed to build any design, directly in your markup.`,
        'src/index.ts': `export default function tailwind() {\n  console.log('Tailwind v4 loaded');\n}`
      }
    }
  };

  // API Route: Get Repository Metadata
  app.get('/api/github/repo', async (req, res) => {
    const owner = (req.query.owner as string) || 'facebook';
    const repo = (req.query.repo as string) || 'react';
    const fullName = `${owner}/${repo}`.toLowerCase();

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          'User-Agent': 'AI-Studio-Applet',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
        }
      });

      if (!response.ok) {
        if (mockRepos[fullName]) {
          return res.json(mockRepos[fullName]);
        }
        return res.status(response.status).json({ 
          error: `GitHub repository not found or rate limited (${response.status}). You can test with presets like facebook/react or tailwindlabs/tailwindcss.` 
        });
      }

      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      if (mockRepos[fullName]) {
        return res.json(mockRepos[fullName]);
      }
      res.status(500).json({ error: err.message || 'Failed to fetch repository metadata' });
    }
  });

  // API Route: Get Repository Tree
  app.get('/api/github/tree', async (req, res) => {
    const owner = (req.query.owner as string) || 'facebook';
    const repo = (req.query.repo as string) || 'react';
    const branch = (req.query.branch as string) || 'main';
    const fullName = `${owner}/${repo}`.toLowerCase();

    try {
      const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
        headers: {
          'User-Agent': 'AI-Studio-Applet',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
        }
      });

      if (!response.ok) {
        if (mockRepos[fullName]) {
          return res.json({ tree: mockRepos[fullName].tree });
        }
        return res.status(response.status).json({ error: 'Failed to fetch tree structure' });
      }

      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      if (mockRepos[fullName]) {
        return res.json({ tree: mockRepos[fullName].tree });
      }
      res.status(500).json({ error: err.message || 'Failed to fetch tree' });
    }
  });

  // API Route: Get File Content
  app.get('/api/github/file', async (req, res) => {
    const owner = (req.query.owner as string) || 'facebook';
    const repo = (req.query.repo as string) || 'react';
    const filePath = (req.query.path as string) || 'README.md';
    const branch = (req.query.branch as string) || 'main';
    const fullName = `${owner}/${repo}`.toLowerCase();

    try {
      const response = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`, {
        headers: {
          'User-Agent': 'AI-Studio-Applet'
        }
      });

      if (!response.ok) {
        if (mockRepos[fullName] && mockRepos[fullName].files && mockRepos[fullName].files[filePath]) {
          return res.send(mockRepos[fullName].files[filePath]);
        }
        return res.status(response.status).json({ error: 'Failed to fetch file content' });
      }

      const content = await response.text();
      res.send(content);
    } catch (err: any) {
      if (mockRepos[fullName] && mockRepos[fullName].files && mockRepos[fullName].files[filePath]) {
        return res.send(mockRepos[fullName].files[filePath]);
      }
      res.status(500).json({ error: err.message || 'Failed to fetch file' });
    }
  });

  // Setup Vite middleware in development
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
