---
trigger: model_decision
description: Reference for task structure, format, and fields
globs: **/*
---

- **Task Structure Fields**

  - **id**: Unique identifier (Example: `1`)
  - **title**: Brief, descriptive title (Example: `"Initialize Repo"`)
  - **description**: Concise summary of the task (Example: `"Create a new repository, set up initial structure."`)
  - **status**: Current state (Example: `"pending"`, `"done"`, `"deferred"`)
  - **dependencies**: IDs of prerequisite tasks (Example: `[1, 2]`)
    - Dependencies are displayed with status indicators (✅ for completed, ⏱️ for pending)
  - **priority**: Importance level (Example: `"high"`, `"medium"`, `"low"`)
  - **details**: In-depth implementation instructions
  - **testStrategy**: Verification approach
  - **subtasks**: List of smaller, more specific tasks

- **Task File Format**

  ```
  # Task ID: <id>
  # Title: <title>
  # Status: <status>
  # Dependencies: <comma-separated list of dependency IDs>
  # Priority: <priority>
  # Description: <brief description>
  # Details:
  <detailed implementation notes>

  # Test Strategy:
  <verification approach>
  ```

- **Task Status Values**

  - `pending`: Task is ready to be worked on
  - `in-progress`: Task is currently being worked on
  - `review`: Task is complete and ready for review
  - `done`: Task is completed and verified
  - `deferred`: Task has been postponed
  - `cancelled`: Task has been cancelled
  - Custom status values can be added as needed

- **Dependency Management**

  - Tasks can depend on other tasks using the `dependencies` field
  - Circular dependencies are automatically detected and prevented
  - Dependencies can be added/removed using the `add-dependency` and `remove-dependency` commands
  - The `fix-dependencies` command can automatically fix invalid dependencies

- **Subtasks**

  - Used to break down complex tasks into smaller, more manageable pieces
  - Can be generated automatically using the `expand` command
  - Can be managed using the `add-subtask` and `remove-subtask` commands
  - Subtasks inherit the parent task's dependencies by default
  - Subtasks can have their own dependencies, including dependencies on other subtasks

- **Task Priorities**

  - `high`: Critical path tasks that block other work
  - `medium`: Important but not blocking
  - `low`: Nice-to-have tasks that can be deferred
  - Priorities help in task selection and scheduling

- **Task Metadata**

  - `createdAt`: Timestamp when task was created
  - `updatedAt`: Timestamp when task was last modified
  - `completedAt`: Timestamp when task was marked as done
  - `assignedTo`: Optional field to assign tasks to team members
  - `tags`: Optional array of tags for categorization

- **Task Templates**

  - Common task patterns can be saved as templates
  - Use the `--template` flag with `add-task` to use a template
  - Example: `task-master add-task --template=api-endpoint --name="User Authentication"`

- **Task History**
  - All changes to tasks are tracked
  - Use `task-master history <task-id>` to view change history
  - Helps in understanding task evolution and decision making
