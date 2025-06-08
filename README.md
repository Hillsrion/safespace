# SafeSpace

A secure, invite-only platform for sharing confidential information about reported entities in the photography industry.

### Prerequisites

- Node.js 20+ and Yarn 1.22+
- PostgreSQL 16+

### Installation

1. Install dependencies:

   ```bash
   yarn install
   ```

2. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Set up the database:

   ```bash
   # Generate Prisma Client
   yarn prisma generate

   # Run migrations
   yarn prisma migrate dev
   ```

Your application will be available at `http://localhost:5173`.

## 🌱 Database Seeding

Populate the database with sample data for development:

```bash
yarn db:seed
```

**Note:** This will delete all existing data in the database.

The seed script will create:

- 20 users with different roles
- 20-30 spaces across various locations
- 20+ posts per space
- Test media uploads and relationships

## Development

Start the development server:

```bash
yarn dev
```

## 🏗 Building for Production

Create a production build:

```bash
yarn build
```

## 🚀 Deployment

### Prerequisites

- Netlify account
- Netlify CLI (optional)

### Deploy to Netlify

1. Push your code to a Git repository
2. [Create a new site on Netlify](https://docs.netlify.com/welcome/add-new-site/)
3. Connect your Git repository
4. Set up environment variables in the Netlify dashboard
5. Deploy!

Or use the Netlify CLI:

```bash
# Install Netlify CLI if you haven't already
yarn global add netlify-cli

# Login to Netlify
netlify login

# Deploy to a new site
netlify deploy --prod
```

## 🛠 Development Scripts

- `yarn dev` - Start development server
- `yarn build` - Create production build
- `yarn preview` - Preview production build locally
- `yarn test` - Run tests
- `yarn lint` - Lint code
- `yarn format` - Format code
- `yarn prisma:generate` - Generate Prisma client
- `yarn db:seed` - Seed the database
- `yarn db:reset` - Reset and seed the database

## 🎨 Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling. The configuration can be found in `tailwind.config.js`.

### Customization

- Theme colors and fonts are defined in `tailwind.config.js`
- Custom CSS can be added to `app/styles/global.css`
- Component-specific styles should use Tailwind's `@apply` directive

## 📄 License

This project is licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) - see the [LICENSE](LICENSE) file for details.

**Important AGPL Notice**:

- This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
- This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.
- You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.

---
