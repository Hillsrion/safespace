---
trigger: model_decision
description: Environment configuration and setup for task-master
globs: **/*
---

- **Environment Variables**

  - **ANTHROPIC_API_KEY** (Required): Your Anthropic API key for Claude

    - Example: `ANTHROPIC_API_KEY=sk-ant-api03-...`
    - Note: Required for all AI-powered features

  - **MODEL** (Default: `"claude-3-7-sonnet-20250219"`)

    - Example: `MODEL=claude-3-opus-20240229`
    - Supported models:
      - `claude-3-opus-20240229` (most capable)
      - `claude-3-sonnet-20240229` (balanced)
      - `claude-3-haiku-20240307` (fastest)

  - **MAX_TOKENS** (Default: `"4000"`)

    - Example: `MAX_TOKENS=8000`
    - Controls the maximum length of generated responses
    - Higher values allow for more detailed responses but increase API costs

  - **TEMPERATURE** (Default: `"0.7"`)

    - Example: `TEMPERATURE=0.5`
    - Range: 0.0 to 1.0
    - Lower values make output more deterministic
    - Higher values increase creativity/randomness

  - **DEBUG** (Default: `"false"`)

    - Example: `DEBUG=true`
    - Enables debug logging
    - Shows detailed request/response information

  - **LOG_LEVEL** (Default: `"info"`)
    - Example: `LOG_LEVEL=debug`
    - Supported levels: error, warn, info, debug, trace
    - Controls verbosity of console output

- **Project Structure**

  ```
  project-root/
  ├── .env                  # Environment variables
  ├── tasks/
  │   ├── tasks.json       # Main tasks configuration
  │   └── <task-files>.md   # Individual task files
  ├── scripts/
  │   └── dev.js           # Main development script
  └── .windsurf/
      └── rules/          # Rule files
  ```

- **Configuration Files**

  - **.env**

    - Stores environment-specific configuration
    - Should be added to .gitignore
    - Example:
      ```
      ANTHROPIC_API_KEY=your-key-here
      MODEL=claude-3-sonnet-20240229
      DEBUG=false
      ```

  - **tasks/tasks.json**
    - Main configuration for all tasks
    - Managed automatically by task-master commands
    - Should be committed to version control

- **Installation**

  ```bash
  # Install globally
  npm install -g claude-task-master

  # Or use with npx
  npx claude-task-master <command>

  # Initialize a new project
  task-master init
  ```

- **Updating**

  ```bash
  # Update global installation
  npm update -g claude-task-master

  # Check version
  task-master --version
  ```

- **Troubleshooting**

  - **API Errors**: Verify your ANTHROPIC_API_KEY is set and valid
  - **Permission Issues**: Ensure you have write access to project directories
  - **Version Mismatches**: Update to the latest version if experiencing issues
  - **Debug Mode**: Run with `DEBUG=true` for detailed error information

- **Performance Tuning**

  - For large projects, increase `MAX_TOKENS` for complex operations
  - Lower `TEMPERATURE` for more consistent, deterministic output
  - Use `--no-research` flag for faster but potentially less accurate task expansion

- **Security**
  - Never commit .env files containing API keys
  - Use environment variables for sensitive information
  - Review task files before committing them to version control
  - Set appropriate file permissions for configuration files
