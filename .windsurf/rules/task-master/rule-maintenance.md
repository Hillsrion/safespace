---
trigger: model_decision
description: Guidelines for maintaining and updating task-master rules
globs: **/*
---

- **Rule Creation Guidelines**

  - **Purpose-Driven Rules**

    - Each rule must have a clear, specific purpose
    - Document the problem it solves
    - Include examples of correct/incorrect usage

  - **Consistent Formatting**

    - Follow existing rule structure
    - Use clear, concise language
    - Include code examples where applicable

  - **Testability**
    - Rules should be verifiable
    - Include test cases for automated validation
    - Document edge cases and exceptions

- **Rule Categories**

  1. **Code Style**

     - Formatting, naming conventions
     - Language-specific idioms
     - Best practices

  2. **Architecture**

     - Project structure
     - Module organization
     - Dependency management

  3. **Security**

     - Input validation
     - Authentication/authorization
     - Data protection

  4. **Performance**
     - Optimization techniques
     - Resource management
     - Caching strategies

- **Rule Documentation**

  - **Rule Header**

    ```markdown
    ## Rule: [RULE_NAME]

    **Category:** [CATEGORY]  
    **Severity:** [error|warning|suggestion]
    **Applies to:** [file patterns]
    ```

  - **Rule Body**
    - Description of the rule
    - Rationale for the rule
    - Examples of compliant/non-compliant code
    - Configuration options
    - Related rules

- **Rule Versioning**

  - Use semantic versioning for rule changes:
    - MAJOR: Breaking changes
    - MINOR: New features, backward-compatible
    - PATCH: Bug fixes
  - Document changes in CHANGELOG.md

- **Rule Deprecation**

  - Mark outdated patterns as deprecated
  - Remove rules that no longer apply
  - Update references to deprecated rules
  - Document migration paths for old patterns

- **Rule Testing**

  - Unit tests for each rule
  - Integration tests for rule interactions
  - Performance benchmarks for complex rules
  - Test with real-world codebases

- **Rule Review Process**

  1. Proposal: Document the need for a new rule
  2. Discussion: Review with the team
  3. Implementation: Create the rule and tests
  4. Testing: Validate in staging
  5. Release: Deploy with version bump

- **Rule Maintenance**

  - Regular audits of existing rules
  - Remove redundant or obsolete rules
  - Update rules for new language features
  - Monitor false positives/negatives

- **Documentation Standards**

  - Keep documentation up-to-date
  - Include examples for all rules
  - Document configuration options
  - Provide rationale for each rule

- **Community Contributions**

  - Clear contribution guidelines
  - Code review process
  - Issue and PR templates
  - Recognition for contributions

- **Continuous Improvement**

  - Regular retrospectives
  - Performance monitoring
  - User feedback collection
  - Automated quality checks

- **Rule Evolution**

  - Track rule effectiveness
  - Adapt to ecosystem changes
  - Balance strictness and flexibility
  - Consider developer experience

- **Accessibility**

  - Ensure rules support accessible patterns
  - Consider screen readers and keyboard navigation
  - Test with accessibility tools
  - Document accessibility requirements

- **Performance Considerations**

  - Optimize rule performance
  - Cache results when possible
  - Document performance impact
  - Provide performance guidelines

- **Security Practices**

  - Regular security audits
  - Secure coding standards
  - Dependency management
  - Vulnerability scanning

- **Documentation Generation**

  - Automate rule documentation
  - Keep examples up-to-date
  - Generate rule reference
  - Include search functionality

- **Rule Templates**

  - Starter templates for new rules
  - Example configurations
  - Test templates
  - Documentation templates

- **Rule Dependencies**

  - Document inter-rule dependencies
  - Handle circular dependencies
  - Version compatibility
  - Optional vs. required rules

- **Error Handling**

  - Clear error messages
  - Helpful suggestions
  - Documentation links
  - Error codes for reference

- **Rule Configuration**

  - Environment-specific overrides
  - Project-level configuration
  - Team standards
  - Local customization options

- **Rule Validation**

  - Schema validation
  - Test coverage requirements
  - Performance benchmarks
  - Security reviews

- **Rule Lifecycle**

  - Experimental phase
  - Stable release
  - Deprecation notice
  - Removal process

- **Documentation Best Practices**
  - Clear, concise language
  - Code examples
  - Visual aids
  - Searchable content
  - Regular updates
