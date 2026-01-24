import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  tutorialSidebar: [
    {
      type: 'category',
      label: 'CLI',
      link: {
        type: 'generated-index',
        title: 'Claude Code Router CLI',
        description: 'Command-line tool usage guide',
        slug: 'category/cli',
      },
      items: [
        'cli/intro',
        'cli/installation',
        'cli/quick-start',
        'troubleshooting',
        {
          type: 'category',
          label: 'Commands',
          link: {
            type: 'generated-index',
            title: 'CLI Commands',
            description: 'Complete command reference',
            slug: 'category/cli-commands',
          },
          items: [
            'cli/commands/start',
            'cli/commands/model',
            'cli/commands/project',
            'cli/commands/status',
            'cli/commands/statusline',
            'cli/commands/preset',
            'cli/commands/other',
          ],
        },
        {
          type: 'category',
          label: 'Configuration',
          key: 'cli-configuration-category',
          link: {
            type: 'generated-index',
            title: 'CLI Configuration',
            description: 'CLI configuration guide',
            slug: 'category/cli-config',
          },
          items: [
            'cli/config/basic',
            'cli/config/project-level',
          ],
        },
        {
          type: 'category',
          label: 'Migration',
          link: {
            type: 'generated-index',
            title: 'Migration Guides',
            description: 'Migrate from other versions',
            slug: 'category/migration',
          },
          items: [
            'migration/from-ccr-custom',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Server',
      link: {
        type: 'generated-index',
        title: 'Claude Code Router Server',
        description: 'Deploy and manage Claude Code Router server',
        slug: 'category/server',
      },
      items: [
        'server/intro',
        'server/deployment',
        {
          type: 'category',
          label: 'API Reference',
          link: {
            type: 'generated-index',
            title: 'API Reference',
            description: 'Server API documentation',
            slug: 'category/api',
          },
          items: [
            'server/api/overview',
            'server/api/messages-api',
            'server/api/config-api',
            'server/api/logs-api',
          ],
        },
        {
          type: 'category',
          label: 'Configuration',
          key: 'server-configuration-category',
          link: {
            type: 'generated-index',
            title: 'Server Configuration',
            description: 'Server configuration guide',
            slug: 'category/server-config',
          },
          items: [
            'server/config/basic',
            'server/config/providers',
            'server/config/routing',
            'server/config/transformers',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          link: {
            type: 'generated-index',
            title: 'Advanced Topics',
            description: 'Advanced features and customization',
            slug: 'category/server-advanced',
          },
          items: [
            'server/advanced/custom-router',
          ],
        },
      ],
    },
    {
      type: 'category',
      label: 'Presets',
      link: {
        type: 'generated-index',
        title: 'CCR Presets',
        description: 'Predefined configurations for quick setup',
        slug: 'category/presets',
      },
      items: ['presets/intro'],
    },
    {
      type: 'category',
      label: 'Team',
      link: {
        type: 'generated-index',
        title: 'Team Collaboration',
        description: 'Guides for team collaboration with agent sharing',
        slug: 'category/team',
      },
      items: [
        'team/git-workflow',
        'team/onboarding',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      link: {
        type: 'generated-index',
        title: 'Workflow Examples',
        description: 'Step-by-step workflow configuration examples',
        slug: 'category/examples',
      },
      items: [
        'examples/workflow-setup',
        'examples/workflow-use-cases',
      ],
    },
  ],
};

export default sidebars;
