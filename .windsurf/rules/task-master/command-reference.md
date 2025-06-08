---
trigger: model_decision
description: Comprehensive reference for all task-master CLI commands
globs: **/*
---

- **Command: parse-prd**

  - Legacy: `node scripts/dev.js parse-prd --input=<prd-file.txt>`
  - CLI: `task-master parse-prd --input=<prd-file.txt>`
  - Description: Parses a PRD document and generates a tasks.json file
  - Parameters:
    - `--input=<file>`: Path to the PRD text file (default: sample-prd.txt)
  - Example: `task-master parse-prd --input=requirements.txt`
  - Notes: Will overwrite existing tasks.json

- **Command: update**

  - Legacy: `node scripts/dev.js update --from=<id> --prompt="<prompt>"`
  - CLI: `task-master update --from=<id> --prompt="<prompt>"`
  - Description: Updates tasks with ID >= specified ID based on prompt
  - Parameters:
    - `--from=<id>`: Task ID from which to start updating (required)
    - `--prompt="<text>"`: Explanation of changes (required)
  - Example: `task-master update --from=4 --prompt="Now using Express instead of Fastify"`
  - Notes: Only updates non-'done' tasks

- **Command: generate**

  - Legacy: `node scripts/dev.js generate`
  - CLI: `task-master generate`
  - Description: Generates individual task files in tasks/ directory
  - Parameters:
    - `--file=<path>, -f`: Alternative tasks.json file
    - `--output=<dir>, -o`: Output directory (default: 'tasks')
  - Notes: Overwrites existing task files

- **Command: set-status**

  - Legacy: `node scripts/dev.js set-status --id=<id> --status=<status>`
  - CLI: `task-master set-status --id=<id> --status=<status>`
  - Description: Updates task status in tasks.json
  - Parameters:
    - `--id=<id>`: Task ID to update (required)
    - `--status=<status>`: New status (required)
  - Example: `task-master set-status --id=3 --status=done`

- **Command: list**

  - Legacy: `node scripts/dev.js list`
  - CLI: `task-master list`
  - Description: Lists all tasks with IDs, titles, and status
  - Parameters:
    - `--status=<status>, -s`: Filter by status
    - `--with-subtasks`: Show subtasks
    - `--file=<path>, -f`: Alternative tasks.json file

- **Command: expand**

  - Legacy: `node scripts/dev.js expand --id=<id> [--num=<number>] [--research] [--prompt="<context>"]`
  - CLI: `task-master expand --id=<id> [--num=<number>] [--research] [--prompt="<context>"]`
  - Description: Expands a task with subtasks
  - Parameters:
    - `--id=<id>`: Task ID to expand (required unless --all)
    - `--all`: Expand all pending tasks
    - `--num=<number>`: Number of subtasks (default: from complexity report)
    - `--research`: Use Perplexity AI
    - `--prompt="<text>"`: Additional context
    - `--force`: Regenerate existing subtasks

- **Command: analyze-complexity**

  - Legacy: `node scripts/dev.js analyze-complexity [options]`
  - CLI: `task-master analyze-complexity [options]`
  - Description: Analyzes task complexity and generates recommendations
  - Parameters:
    - `--output=<file>, -o`: Output file (default: scripts/task-complexity-report.json)
    - `--model=<model>, -m`: Override LLM model
    - `--threshold=<number>, -t`: Minimum score for expansion (default: 5)
    - `--file=<path>, -f`: Alternative tasks.json file
    - `--research, -r`: Use Perplexity AI

- **Command: clear-subtasks**

  - Legacy: `node scripts/dev.js clear-subtasks --id=<id>`
  - CLI: `task-master clear-subtasks --id=<id>`
  - Description: Removes subtasks from specified tasks
  - Parameters:
    - `--id=<id>`: Task ID(s) to clear (comma-separated)
    - `--all`: Clear all subtasks
  - Examples:
    - `task-master clear-subtasks --id=3`
    - `task-master clear-subtasks --all`

- **Command: add-dependency**

  - Legacy: `node scripts/dev.js add-dependency --id=<id> --depends-on=<id>`
  - CLI: `task-master add-dependency --id=<id> --depends-on=<id>`
  - Description: Adds a dependency between tasks
  - Parameters:
    - `--id=<id>`: Task to add dependency to (required)
    - `--depends-on=<id>`: Task that must be completed first (required)
  - Example: `task-master add-dependency --id=5 --depends-on=3`

- **Command: remove-dependency**

  - Legacy: `node scripts/dev.js remove-dependency --id=<id> --depends-on=<id>`
  - CLI: `task-master remove-dependency --id=<id> --depends-on=<id>`
  - Description: Removes a dependency between tasks
  - Parameters:
    - `--id=<id>`: Task to remove dependency from (required)
    - `--depends-on=<id>`: Task to remove as dependency (required)

- **Command: next**

  - Legacy: `node scripts/dev.js next`
  - CLI: `task-master next`
  - Description: Shows the next task to work on based on dependencies and status
  - Parameters:
    - `--file=<path>, -f`: Alternative tasks.json file
    - `--complexity-report=<path>`: Path to complexity report

- **Command: init**
  - CLI: `task-master init`
  - Description: Initializes a new Task Master project
  - Parameters:
    - `--skip-install`: Skip npm install
    - `--add-aliases`: Add shell aliases
    - `--yes`: Skip prompts
  - Notes: Creates necessary directories and configuration files
