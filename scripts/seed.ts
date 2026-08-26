// scripts/seed.ts
import { PrismaClient, PostStatus, Prisma } from "../app/generated/prisma";
import { fakerFR as faker } from "@faker-js/faker";
import { hashPassword, validatePassword } from "~/lib/password";
import "dotenv/config"; // Load environment variables

// Function to remove accents from strings
const removeAccents = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

// Function to generate a name without honorifics
const generateName = (): string => {
  const name = faker.person.fullName();
  // Common titles and honorifics to remove
  const honorifics = [
    'mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'sir', 'dame',
    'lord', 'lady', 'rev', 'fr', 'brother', 'sister', 'father', 'mother',
    'm\.', 'mme', 'mlle', 'm\.', 'mme', 'mlle', 'm\.', 'mme', 'mlle',
    'mr\.', 'mrs\.', 'ms\.', 'dr\.', 'prof\.', 'sr\.', 'jr\.', 'esq', 'esq\.',
    'hon', 'hon\.', 'honorable', 'the honorable', 'the hon', 'the hon\.',
    'sir', 'dame', 'lady', 'lord', 'sir\.', 'dame\.', 'lady\.', 'lord\.'
  ];
  // Create a regex pattern that matches any of the honorifics at the start of the string
  const honorificPattern = new RegExp(`^\\s*(${honorifics.join('|')})[\\s\\.]+`, 'i');
  // Remove the honorific and any extra spaces
  return name.replace(honorificPattern, '').trim();
};

const systemDatabaseUrl =
  process.env.SYSTEM_DATABASE_URL?.trim() || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasourceUrl: systemDatabaseUrl });

type SeedRoleCapability = {
  roleName: string;
  canBypassRls: boolean;
  ownsAllTables: boolean;
};

async function assertSeedRoleCanBypassRls(): Promise<void> {
  const [capability] = await prisma.$queryRaw<SeedRoleCapability[]>`
    SELECT
      current_user::text AS "roleName",
      role.rolbypassrls AS "canBypassRls",
      bool_and(table_class.relowner = role.oid) AS "ownsAllTables"
    FROM pg_catalog.pg_roles role
    CROSS JOIN pg_catalog.pg_class table_class
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = table_class.relnamespace
    WHERE role.rolname = current_user
      AND namespace.nspname = 'public'
      AND table_class.relname IN (
        'User', 'Space', 'UserSpaceMembership', 'Invite',
        'ReportedEntity', 'ReportedEntityHandle', 'Post', 'Media',
        'PostFlag', 'AuditLog', 'SavedSearch', 'MediaDeletionJob'
      )
    GROUP BY role.oid, role.rolbypassrls
  `;

  if (!capability?.canBypassRls && !capability?.ownsAllTables) {
    throw new Error(
      `Seed role ${capability?.roleName ?? "<unknown>"} cannot bypass RLS. ` +
        "Set SYSTEM_DATABASE_URL to the migration owner or an explicit BYPASSRLS role."
    );
  }
}

// --- Configuration ---
const NUM_USERS = process.env.SEED_NUM_USERS
  ? parseInt(process.env.SEED_NUM_USERS, 10)
  : 20;
const NUM_CITIES = process.env.SEED_NUM_CITIES
  ? parseInt(process.env.SEED_NUM_CITIES, 10)
  : 5; // e.g. Paris, Lyon, Marseille
const SPACES_PER_CITY_MIN = process.env.SEED_SPACES_PER_CITY_MIN
  ? parseInt(process.env.SEED_SPACES_PER_CITY_MIN, 10)
  : 7; // Adjusted for ~20-30 spaces total
const SPACES_PER_CITY_MAX = process.env.SEED_SPACES_PER_CITY_MAX
  ? parseInt(process.env.SEED_SPACES_PER_CITY_MAX, 10)
  : 10;
const POSTS_PER_SPACE_MIN = process.env.SEED_POSTS_PER_SPACE_MIN
  ? parseInt(process.env.SEED_POSTS_PER_SPACE_MIN, 10)
  : 18;
const POSTS_PER_SPACE_MAX = process.env.SEED_POSTS_PER_SPACE_MAX
  ? parseInt(process.env.SEED_POSTS_PER_SPACE_MAX, 10)
  : 22;
const ADDITIONAL_POSTS_PER_USER = process.env.SEED_ADDITIONAL_POSTS_PER_USER
  ? parseInt(process.env.SEED_ADDITIONAL_POSTS_PER_USER, 10)
  : 3;
const USERS_PER_SPACE_MIN = process.env.SEED_USERS_PER_SPACE_MIN
  ? parseInt(process.env.SEED_USERS_PER_SPACE_MIN, 10)
  : 3;
const USERS_PER_SPACE_MAX = process.env.SEED_USERS_PER_SPACE_MAX
  ? parseInt(process.env.SEED_USERS_PER_SPACE_MAX, 10)
  : 7;

const CITIES = [
  "Paris",
  "Lyon",
  "Marseille",
  "Lille",
  "Bordeaux",
  "Toulouse",
  "Nice",
].slice(0, NUM_CITIES);

const POST_THEMES = [
  {
    type: "spiking",
    templates: [
      "Lors d'une soirée après un shooting à {venue_name}, j'ai accepté un verre proposé par {suspect_full_name}, un photographe présent sur place. Peu après, j'ai eu des vertiges et une sensation de flottement. Je suis partie précipitamment, mal à l'aise. D'autres personnes m'ont ensuite dit avoir eu un ressenti étrange à son contact.",
      "Je veux signaler un incident qui m'est arrivé au {bar_name} après une expo photo. {suspect_full_name} m'a proposé un verre, que j'ai laissé quelques minutes sans surveillance. J'ai ensuite ressenti une forte désorientation. J'ai dû rentrer seule, paniquée. Faites attention à cette personne, plusieurs modèles m'ont partagé des expériences similaires.",
      "Lors d'un after entre photographes et modèles à {event_location}, {suspect_full_name} m'a offert un verre. En moins de 15 minutes, j'étais confuse, j'avais du mal à tenir debout. Je ne bois presque jamais, donc c'était clairement anormal. J'ai fui sans trop comprendre ce qu'il m'arrivait. Je ne suis malheureusement pas la seule à avoir eu un malaise après un verre avec lui.",
    ],
    details: () => {
      const suspectFullName = generateName();
      return {
        venue_name: faker.company.name() + " Studio",
        bar_name: faker.company.name() + " Bar",
        event_location: faker.location.city() + ", " + faker.location.street(),
        suspect_full_name: suspectFullName,
        reported_entity_name: suspectFullName,
      };
    },
  },
  {
    type: "misconduct",
    templates: [
      "Je me permets de relayer plusieurs témoignages que j’ai reçus concernant le photographe {photographer_full_name} (@{ig_handle}), connu dans la scène photo à {city}. Les retours concernent des comportements graves : cris pendant les shoots, propos dégradants comme 'ça c’est une pose de pute', insistance pour des nudes, non-paiement, et vol de contenu. Si vous avez eu une mauvaise expérience, n’hésitez pas à témoigner aussi.",
      "J’ai travaillé avec {photographer_full_name} il y a quelques mois dans le cadre d’un projet. Sur place, il était seul, l’ambiance très oppressante, et il a verrouillé la porte une fois dans le studio. J’ai eu très peur. Il a tenté de me convaincre de faire des photos très explicites, en me disant que 'c’est comme ça qu’on perce'. Je suis partie dès que j’ai pu. Faites attention à vous.",
      "Ce message s’adresse aux modèles travaillant à {city} : le photographe {photographer_full_name} m’a menacée de ne pas me remettre mes photos si je ne faisais pas une session 'plus hot' le lendemain. Il a aussi refusé que j’amène une amie au shooting. J’ai appris par la suite qu’il avait eu des comportements similaires avec d’autres modèles. Si vous avez aussi vécu des choses avec lui, je vous invite à en parler.",
    ],
    details: () => {
      const photographerFullName = generateName();
      const [firstName, lastName] = photographerFullName.split(" ");
      const cleanFirstName = removeAccents(firstName || "");
      const cleanLastName = removeAccents(lastName || "");
      const baseHandle =
        `${cleanLastName || ""}${
          cleanFirstName ? `.${cleanFirstName.charAt(0)}` : ""
        }`.toLowerCase() || faker.internet.userName().toLowerCase();
      const igHandle = `sf.${baseHandle}${faker.string.numeric(2)}`;
      return {
        photographer_full_name: photographerFullName,
        reported_entity_name: photographerFullName,
        ig_handle: igHandle,
        city: faker.location.city(),
        location: faker.location.streetAddress(true),
      };
    },
  },
  {
    type: "coercion",
    templates: [
      "J'ai subi des pressions pour me déshabiller de la part de {contact_person_full_name}, qui se présentait comme {contact_person_role}, pendant un casting bidon à {address}.",
      "Le directeur de {company_name}, {contact_person_full_name}, a eu un comportement déplacé et insistant pour que je {action_coerced} après un entretien.",
    ],
    details: () => {
      const contactPersonFullName = generateName();
      return {
        contact_person_full_name: contactPersonFullName,
        reported_entity_name: contactPersonFullName,
        contact_person_role: faker.person.jobType(),
        address:
          faker.location.secondaryAddress() + " " + faker.location.street(),
        company_name: faker.company.name(),
        action_coerced: faker.word.verb() + " " + faker.word.noun(),
      };
    },
  },
];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomSubset<T>(arr: T[], min: number, max: number): T[] {
  const count = faker.number.int({ min, max: Math.min(max, arr.length) });
  return faker.helpers.arrayElements(arr, count);
}

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/{(\w+)}/g, (_, key) => values[key] || `{${key}}`);
}

async function main() {
  const superAdminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD;
  if (!superAdminEmail || !superAdminEmail.includes("@")) {
    throw new Error("SUPERADMIN_EMAIL must be configured before running the seed");
  }
  if (!superAdminPassword || !validatePassword(superAdminPassword)) {
    throw new Error(
      "SUPERADMIN_PASSWORD must meet every application password requirement before running the seed"
    );
  }

  // The destructive seed is a system job, never an end-user request. Refuse
  // to rely on the application role or on user-controlled RLS session values.
  await assertSeedRoleCanBypassRls();

  console.log(`🌱 Starting seeding process...`);
  console.log(`🎲 Using ${faker.seed()} as faker seed`);

  console.log("🧹 Deleting existing data (order is important)...");
  await prisma.mediaDeletionJob.deleteMany({});
  await prisma.savedSearch.deleteMany({});
  await prisma.userSpaceMembership.deleteMany({});
  await prisma.postFlag.deleteMany({}); // Added PostFlag
  await prisma.media.deleteMany({}); // Added Media
  await prisma.post.deleteMany({});
  await prisma.reportedEntityHandle.deleteMany({});
  await prisma.reportedEntity.deleteMany({});
  await prisma.invite.deleteMany({}); // Added Invite
  await prisma.auditLog.deleteMany({}); // Added AuditLog
  await prisma.space.deleteMany({});
  await prisma.user.deleteMany({});
  console.log("🗑️  Existing data deleted.");

  // 1. Create Super Admin from environment variables
  const superAdminFirstName = process.env.SUPERADMIN_FIRSTNAME || "Admin";
  const superAdminLastName = process.env.SUPERADMIN_LASTNAME || "User";

  // Create or update super admin user
  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      password: await hashPassword(superAdminPassword),
      firstName: superAdminFirstName,
      lastName: superAdminLastName,
      isSuperAdmin: true,
    },
    create: {
      email: superAdminEmail,
      password: await hashPassword(superAdminPassword),
      firstName: superAdminFirstName,
      lastName: superAdminLastName,
      isSuperAdmin: true,
    },
  });
  console.log(`👑 Super admin created/updated: ${superAdmin.email}`);

  // 2. Create Regular Users
  console.log(`👥 Creating ${NUM_USERS - 1} regular users...`);
  const users: Prisma.UserCreateInput[] = [];

  for (let i = 0; i < NUM_USERS - 1; i++) {
    const firstName = faker.person.firstName("female");
    const lastName = faker.person.lastName();

    users.push({
      email: faker.internet
        .email({ firstName, lastName, provider: "fakemail.test" })
        .toLowerCase(),
      password: await hashPassword("password123"),
      firstName,
      lastName,
      instagram: `${removeAccents(firstName.toLowerCase())}.${removeAccents(
        lastName.toLowerCase()
      )}.sf`,
      isSuperAdmin: false,
    });
  }
  const createdUsers = await prisma.user.createManyAndReturn({ data: users });
  console.log(`✅ ${createdUsers.length} users created.`);

  // 3. Create Spaces
  console.log("🏙️  Creating spaces...");
  const createdSpaces = [];

  for (const city of CITIES) {
    const numSpacesInCity = faker.number.int({
      min: SPACES_PER_CITY_MIN,
      max: SPACES_PER_CITY_MAX,
    });

    for (let i = 0; i < numSpacesInCity; i++) {
      const creator = getRandomElement(createdUsers);

      // First create the space with just the required fields
      const space = await prisma.space.create({
        data: {
          name: `${city} - SafeZone ${i + 1}`,
          description: faker.lorem.sentence(),
          createdBy: creator.id,
        },
        include: {
          creator: true,
        },
      });

      createdSpaces.push(space);
    }
  }
  console.log(`✅ ${createdSpaces.length} spaces created.`);

  // Track the last created date for each user to ensure posts are not on the same day
  const userLastPostDate: Record<string, Date> = {};

  // Helper function to get a date that's before the user's last post
  const getPostDate = (userId: string): Date => {
    const now = new Date();
    let lastDate = userLastPostDate[userId];

    // If user has no posts yet, use a random date in the past 2 years
    if (!lastDate) {
      const daysAgo = faker.number.int({ min: 1, max: 730 }); // Up to 2 years
      lastDate = new Date(now);
      lastDate.setDate(now.getDate() - daysAgo);
    } else {
      // Otherwise, set the date to at least one day before the last post
      lastDate = new Date(lastDate);
      lastDate.setDate(
        lastDate.getDate() - faker.number.int({ min: 1, max: 30 })
      );
    }

    // Update the user's last post date
    userLastPostDate[userId] = lastDate;
    return lastDate;
  };

  // 4. Create UserSpaceMemberships
  console.log("🤝 Creating user space memberships...");
  const memberships: Array<{
    userId: string;
    spaceId: string;
    role: string;
  }> = [];

  for (const space of createdSpaces) {
    const spaceUsers = getRandomSubset(
      createdUsers,
      USERS_PER_SPACE_MIN,
      USERS_PER_SPACE_MAX
    );
    const creatorId = space.createdBy;
    const creatorUser = createdUsers.find((u) => u.id === creatorId);

    // Make sure creator is in the space and is an admin
    if (creatorUser) {
      // Remove creator from spaceUsers if they were already added
      const creatorIndex = spaceUsers.findIndex((u) => u.id === creatorId);
      if (creatorIndex !== -1) {
        spaceUsers.splice(creatorIndex, 1);
      }

      // Add creator as admin
      memberships.push({
        userId: creatorId,
        spaceId: space.id,
        role: "ADMIN",
      });
    }

    // Add other users with random roles (but not Admin)
    for (const user of spaceUsers) {
      memberships.push({
        userId: user.id,
        spaceId: space.id,
        role: Math.random() < 0.2 ? "MODERATOR" : "READ_ONLY",
      });
    }
  }
  // Deduplicate memberships (in case a user was randomly selected and is also creator)
  const uniqueMemberships = memberships.filter(
    (ms, index, self) =>
      index ===
      self.findIndex((m) => m.userId === ms.userId && m.spaceId === ms.spaceId)
  );

  // Create memberships one by one since we're using a composite ID
  for (const membership of uniqueMemberships) {
    await prisma.userSpaceMembership.upsert({
      where: {
        userId_spaceId: {
          userId: membership.userId,
          spaceId: membership.spaceId,
        },
      },
      update: {
        role: membership.role,
      },
      create: {
        userId: membership.userId,
        spaceId: membership.spaceId,
        role: membership.role,
      },
    });
  }
  console.log(`✅ ${uniqueMemberships.length} user space memberships created.`);

  // 4. Create Posts (20 per space)
  console.log("📝 Creating posts per space...");
  let postsCreatedCount = 0;
  for (const space of createdSpaces) {
    const spaceMemberRecords = await prisma.userSpaceMembership.findMany({
      where: { spaceId: space.id },
      include: { user: true },
    });
    const spaceUsers = spaceMemberRecords.map((ms) => ms.user);

    if (spaceUsers.length === 0) {
      console.warn(
        `⚠️  Space ${space.name} (ID: ${space.id}) has no users, skipping post creation.`
      );
      continue;
    }

    const numPostsInSpace = faker.number.int({
      min: POSTS_PER_SPACE_MIN,
      max: POSTS_PER_SPACE_MAX,
    });
    for (let i = 0; i < numPostsInSpace; i++) {
      const theme = getRandomElement(POST_THEMES);
      const contentDetails = theme.details();
      const description = interpolate(
        getRandomElement(theme.templates),
        contentDetails
      );

      const isAnonymous = Math.random() < 0.15; // 15% chance
      const isAdminOnly = Math.random() < 0.1; // 10% chance
      const author = isAnonymous ? null : getRandomElement(spaceUsers);

      // Create Reported Entity
      // Use the reported_entity_name from the theme details if available, otherwise generate a random name
      const reportedEntityName =
        contentDetails.reported_entity_name || faker.person.fullName();
      const [firstName, lastName] = reportedEntityName.split(" ");
      const baseHandle =
        `${lastName || ""}${
          firstName ? `.${firstName.charAt(0)}` : ""
        }`.toLowerCase() || faker.internet.userName().toLowerCase();
      const igHandle = `sf.${baseHandle}${faker.string.numeric(2)}`;

      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: getRandomElement(spaceUsers).id } }, // Can be any user in the space
          space: { connect: { id: space.id } },
          handles: {
            create: [
              {
                platform: "Instagram",
                handle: igHandle,
              },
            ],
          },
        },
      });

      const postAuthorId = author?.id;
      const postDate = postAuthorId ? getPostDate(postAuthorId) : new Date();

      await prisma.post.create({
        data: {
          space: { connect: { id: space.id } },
          author: isAnonymous
            ? undefined
            : author
            ? { connect: { id: author.id } }
            : undefined,
          reportedEntity: { connect: { id: createdReportedEntity.id } },
          description,
          isAnonymous,
          isAdminOnly,
          status: getRandomElement(Object.values(PostStatus)),
          severity: getRandomElement(["low", "medium", "high"]), // Prisma enum values directly
          verificationStatus: getRandomElement([
            "unverified",
            "pending",
            "verified",
            "disputed",
          ]),
          createdAt: postDate,
          updatedAt: postDate,
        },
      });
      postsCreatedCount++;
    }
  }
  console.log(`✅ ${postsCreatedCount} posts created across spaces.`);

  // 5. Create Additional Posts (3 per user)
  console.log("📝 Creating additional posts per user...");
  let additionalPostsCount = 0;
  for (const user of createdUsers) {
    const userMemberships = await prisma.userSpaceMembership.findMany({
      where: { userId: user.id },
      select: { spaceId: true },
    });

    if (userMemberships.length === 0) continue; // User might not be in any space

    for (let i = 0; i < ADDITIONAL_POSTS_PER_USER; i++) {
      const spaceId = getRandomElement(userMemberships).spaceId;
      const theme = getRandomElement(POST_THEMES);
      const contentDetails = theme.details();
      const description = interpolate(
        getRandomElement(theme.templates),
        contentDetails
      );

      // Use the reported_entity_name from the theme details if available, otherwise generate a random name
      const reportedEntityName =
        contentDetails.reported_entity_name || faker.person.fullName();
      const [firstName, lastName] = reportedEntityName.split(" ");
      const baseHandle =
        `${lastName || ""}${
          firstName ? `.${firstName.charAt(0)}` : ""
        }`.toLowerCase() || faker.internet.userName().toLowerCase();
      const igHandle = `sf.${baseHandle}${faker.string.numeric(2)}`;

      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: user.id } },
          space: { connect: { id: spaceId } },
          handles: {
            create: [
              {
                platform: "Instagram",
                handle: igHandle,
              },
            ],
          },
        },
      });

      const postDate = getPostDate(user.id);

      await prisma.post.create({
        data: {
          space: { connect: { id: spaceId } },
          author: { connect: { id: user.id } },
          reportedEntity: { connect: { id: createdReportedEntity.id } },
          description,
          isAnonymous: false,
          isAdminOnly: false,
          status: PostStatus.active,
          createdAt: postDate,
          updatedAt: postDate,
        },
      });
      additionalPostsCount++;
    }
  }
  console.log(`✅ ${additionalPostsCount} additional personal posts created.`);

  console.log("🎉 Seeding finished successfully!");
}

main()
  .catch(async (e) => {
    console.error("Error during seeding:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
