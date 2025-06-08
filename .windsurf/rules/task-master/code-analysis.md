---
trigger: model_decision
description: Code analysis and refactoring techniques for task-master
globs: **/*
---

- **Code Analysis Techniques**

  - **Top-Level Function Search**

    - Use grep to find all exported functions
    - Command: `grep -E "export (function|const) \w+|function \w+\(|const \w+ = \(|module\\.exports" --include="*.js" -r ./`
    - Benefits:
      - Quickly understand module's public API
      - Identify potential code organization issues
      - Find entry points for testing

  - **Dependency Analysis**

    - Use `npm ls` to view dependency tree
    - Command: `npm ls --all`
    - Benefits:
      - Identify outdated dependencies
      - Find unused dependencies
      - Understand dependency relationships

  - **Complexity Analysis**
    - Use `task-master analyze-complexity`
    - Reviews:
      - Task size and scope
      - Number of dependencies
      - Implementation complexity
      - Test coverage requirements

- **Refactoring Patterns**

  - **Extract Function**

    - When: Code block serves a single purpose
    - How: Move to a named function with clear parameters
    - Benefits: Improves readability and reusability

  - **Simplify Conditionals**

    - When: Complex if-else or switch statements
    - How: Use guard clauses, early returns, or strategy pattern
    - Benefits: Reduces nesting and improves clarity

  - **Modularize Code**
    - When: File exceeds 200-300 lines
    - How: Split into logical modules
    - Benefits: Better organization and maintainability

- **Code Quality Tools**

  - **ESLint**

    - Command: `npx eslint .`
    - Benefits: Catches common errors and enforces style

  - **Prettier**

    - Command: `npx prettier --check .`
    - Benefits: Consistent code formatting

  - **Jest**
    - Command: `npx jest --coverage`
    - Benefits: Ensures test coverage

- **Performance Analysis**

  - **Node.js Profiling**

    - Command: `node --inspect-brk your-script.js`
    - Use Chrome DevTools for analysis

  - **Memory Leak Detection**
    - Use `--inspect` flag with Chrome DevTools
    - Look for growing memory in heap snapshots

- **Security Analysis**

  - **npm audit**

    - Command: `npm audit`
    - Benefits: Identifies vulnerable dependencies

  - **Dependency-Check**
    - Command: `npx dependency-check .`
    - Benefits: Finds unused or missing dependencies

- **Documentation Generation**

  - **JSDoc**

    - Command: `npx jsdoc -c jsdoc.json`
    - Benefits: Generates API documentation

  - **TypeScript Type Generation**
    - Command: `npx typescript --declaration`
    - Benefits: Improves IDE support and catches type errors

- **Code Metrics**

  - **Complexity Metrics**

    - Tools: `eslint-plugin-complexity`
    - Benefits: Identifies complex functions that need refactoring

  - **Test Coverage**
    - Command: `npx jest --coverage`
    - Benefits: Ensures adequate test coverage

- **Automated Refactoring**

  - **jscodeshift**

    - Command: `npx jscodeshift -t transform.js`
    - Benefits: Applies large-scale code transformations

  - **TypeScript Migration**
    - Start with `allowJs` and `checkJs`
    - Gradually add type annotations

- **Best Practices**
  - Keep functions small and focused
  - Use meaningful variable and function names
  - Write self-documenting code
  - Follow the Single Responsibility Principle
  - Keep dependencies up to date
  - Write tests for new functionality
  - Document complex algorithms and business logic
  - Use version control effectively
  - Review code regularly
  - Refactor continuously, not just when there are problems
