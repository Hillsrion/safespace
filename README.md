# React Router Netlify Template

A modern, production-ready template for building full-stack React applications using React Router,
deployed to Netlify.

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)
- 💻 Configured for deployment to Netlify

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Database Seeding

This project includes a script to populate the database with sample data for development and testing purposes. This is useful for having a consistent dataset to work with.

**Important:** Running the seed script will first delete all existing data in the relevant tables (Users, Spaces, Posts, etc.) before inserting new data.

### Prerequisites

Ensure you have installed all project dependencies:

```bash
npm install
# or
yarn install
```

### Running the Seed Script

To populate your database with seed data, run the following command:

```bash
npx prisma db seed
```

This command executes the `scripts/seed.ts` file using `tsx`. After the script completes, your database will contain approximately:

*   20 users
*   Around 20-30 spaces distributed across a few cities
*   Around 20 posts per space, with varied content and flags
*   3 additional posts for each user

This data is generated using `@faker-js/faker` for realistic, albeit fake, information.

## Building for Production

Create a production build:

```bash
npm run build
```

## Previewing a Production build

To preview a production build locally, use the [Netlify CLI](https://cli.netlify.com):

```bash
npx netlify-cli serve
```

```bash
npm run build
```

## Deployment

This template is preconfigured for deployment to Netlify.

Follow <https://docs.netlify.com/welcome/add-new-site/> to add this project as a site
in your Netlify account.

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

## See also

[Guide: how to deploy a React Router 7 site to Netlify](https://developers.netlify.com/guides/how-to-deploy-a-react-router-7-site-to-netlify/)

---

Built with ❤️ using React Router.
