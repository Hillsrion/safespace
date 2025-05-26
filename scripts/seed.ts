// scripts/seed.ts
import { PrismaClient, PostStatus, Prisma } from "../app/generated/prisma";
import { fakerFR as faker } from "@faker-js/faker";
import { hashPassword } from "~/lib/password";
import "dotenv/config"; // Load environment variables

// Function to remove accents from strings
const removeAccents = (str: string): string => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
};

const prisma = new PrismaClient();

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
      "Lors d’une soirée après un shooting à {venue_name}, j’ai accepté un verre proposé par {suspect_name}, un photographe présent sur place. Peu après, j’ai eu des vertiges et une sensation de flottement. Je suis partie précipitamment, mal à l’aise. D’autres personnes m’ont ensuite dit avoir eu un ressenti étrange à son contact.",
      "Je veux signaler un incident qui m’est arrivé au {bar_name} après une expo photo. {suspect_name} m’a proposé un verre, que j’ai laissé quelques minutes sans surveillance. J’ai ensuite ressenti une forte désorientation. J’ai dû rentrer seule, paniquée. Faites attention à cette personne, plusieurs modèles m’ont partagé des expériences similaires.",
      "Lors d’un after entre photographes et modèles à {event_location}, {suspect_name} m’a offert un verre. En moins de 15 minutes, j’étais confuse, j’avais du mal à tenir debout. Je ne bois presque jamais, donc c’était clairement anormal. J’ai fui sans trop comprendre ce qu’il m’arrivait. Je ne suis malheureusement pas la seule à avoir eu un malaise après un verre avec lui.",
    ],
    details: () => ({
      venue_name: faker.company.name() + " Studio",
      bar_name: faker.company.name() + " Bar",
      event_location: faker.location.city() + ", " + faker.location.street(),
      suspect_name: faker.person.fullName(),
    }),
  },
  {
    type: "misconduct",
    templates: [
      "Je me permets de relayer plusieurs témoignages que j’ai reçus concernant le photographe {photographer_name} (@{ig_handle}), connu dans la scène photo à {city}. Les retours concernent des comportements graves : cris pendant les shoots, propos dégradants comme 'ça c’est une pose de pute', insistance pour des nudes, non-paiement, et vol de contenu. Si vous avez eu une mauvaise expérience, n’hésitez pas à témoigner aussi.",
      "J’ai travaillé avec {photographer_name} il y a quelques mois dans le cadre d’un projet. Sur place, il était seul, l’ambiance très oppressante, et il a verrouillé la porte une fois dans le studio. J’ai eu très peur. Il a tenté de me convaincre de faire des photos très explicites, en me disant que 'c’est comme ça qu’on perce'. Je suis partie dès que j’ai pu. Faites attention à vous.",
      "Ce message s’adresse aux modèles travaillant à {city} : le photographe {photographer_name} m’a menacée de ne pas me remettre mes photos si je ne faisais pas une session 'plus hot' le lendemain. Il a aussi refusé que j’amène une amie au shooting. J’ai appris par la suite qu’il avait eu des comportements similaires avec d’autres modèles. Si vous avez aussi vécu des choses avec lui, je vous invite à en parler.",
    ],
    details: () => ({
      photographer_name: faker.person.fullName(),
      ig_handle: faker.internet.userName(),
      city: faker.location.city(),
      location: faker.location.streetAddress(true),
    }),
  },
  {
    type: "coercion",
    templates: [
      "J'ai subi des pressions pour me déshabiller de la part de {contact_person_name}, qui se présentait comme {contact_person_role}, pendant un casting bidon à {address}.",
      "Le directeur de {company_name} a eu un comportement déplacé et insistant pour que je {action_coerced} après un entretien.",
    ],
    details: () => ({
      contact_person_name: faker.person.fullName(),
      contact_person_role: faker.person.jobType(),
      address:
        faker.location.secondaryAddress() + " " + faker.location.street(),
      company_name: faker.company.name(),
      action_coerced: faker.word.verb() + " " + faker.word.noun(),
    }),
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
  console.log("Starting seeding process...");
  console.log(`Will use ${faker.seed()} as faker seed`);

  console.log("Deleting existing data (order is important)...");
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
  console.log("Existing data deleted.");

  // 1. Create Super Admin from environment variables
  const superAdminEmail = process.env.SUPERADMIN_EMAIL || "admin@example.com";
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || "password";
  const superAdminFirstName = process.env.SUPERADMIN_FIRSTNAME || "Admin";
  const superAdminLastName = process.env.SUPERADMIN_LASTNAME || "User";

  // Create or update super admin user
  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
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
  console.log(`Super admin created/updated: ${superAdmin.email}`);

  // 2. Create Regular Users
  console.log(`Creating ${NUM_USERS - 1} regular users...`);
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
      instagram:
        Math.random() > 0.5
          ? `${removeAccents(firstName.toLowerCase())}.${removeAccents(
              lastName.toLowerCase()
            )}`
          : null,
      isSuperAdmin: false,
    });
  }
  const createdUsers = await prisma.user.createManyAndReturn({ data: users });
  console.log(`${createdUsers.length} users created.`);

  // 3. Create Spaces
  console.log("Creating spaces...");
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
          name: `${city} - SafeZone ${faker.word.noun()} ${i + 1}`,
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
  console.log(`${createdSpaces.length} spaces created.`);

  // 4. Create UserSpaceMemberships
  console.log("Creating user space memberships...");
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
        role: "Admin",
      });
    }

    // Add other users with random roles (but not Admin)
    for (const user of spaceUsers) {
      memberships.push({
        userId: user.id,
        spaceId: space.id,
        role: Math.random() < 0.2 ? "Moderator" : "Member",
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
  console.log(`${uniqueMemberships.length} user space memberships created.`);

  // 4. Create Posts (20 per space)
  console.log("Creating posts per space...");
  let postsCreatedCount = 0;
  for (const space of createdSpaces) {
    const spaceMemberRecords = await prisma.userSpaceMembership.findMany({
      where: { spaceId: space.id },
      include: { user: true },
    });
    const spaceUsers = spaceMemberRecords.map((ms) => ms.user);

    if (spaceUsers.length === 0) {
      console.warn(
        `Space ${space.name} (ID: ${space.id}) has no users, skipping post creation.`
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
      const reportedEntityName = faker.person.fullName();
      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: getRandomElement(spaceUsers).id } }, // Can be any user in the space
          space: { connect: { id: space.id } },
          handles: {
            create: [
              {
                platform: "Instagram",
                handle: `fake_${faker.internet
                  .userName({
                    firstName: reportedEntityName.split(" ")[0],
                    lastName: reportedEntityName.split(" ")[1] || "",
                  })
                  .toLowerCase()}_${faker.string.alphanumeric(4)}`,
              },
            ],
          },
        },
      });

      await prisma.post.create({
        data: {
          space: { connect: { id: space.id } },
          author: author ? { connect: { id: author.id } } : undefined,
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
        },
      });
      postsCreatedCount++;
    }
  }
  console.log(`${postsCreatedCount} posts created across spaces.`);

  // 5. Create Additional Posts (3 per user)
  console.log("Creating additional posts per user...");
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

      const reportedEntityName = faker.person.fullName();
      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: user.id } },
          space: { connect: { id: spaceId } },
          handles: {
            create: [
              {
                platform: "Instagram",
                handle: `fake_personal_${faker.internet
                  .userName()
                  .toLowerCase()}_${faker.string.alphanumeric(3)}`,
              },
            ],
          },
        },
      });

      await prisma.post.create({
        data: {
          space: { connect: { id: spaceId } },
          author: { connect: { id: user.id } },
          reportedEntity: { connect: { id: createdReportedEntity.id } },
          description: `[Personal Report] ${description}`,
          isAnonymous: false,
          isAdminOnly: false,
          status: PostStatus.active,
        },
      });
      additionalPostsCount++;
    }
  }
  console.log(`${additionalPostsCount} additional personal posts created.`);

  console.log("Seeding finished successfully!");
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
