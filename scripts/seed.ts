// scripts/seed.ts
import { PrismaClient, PostStatus, Prisma } from '../app/generated/prisma';
import { fakerFR as faker } from '@faker-js/faker'; // Using French Faker

const prisma = new PrismaClient();

// --- Configuration ---
const NUM_USERS = 20;
const NUM_CITIES = 3; // e.g. Paris, Lyon, Marseille
const SPACES_PER_CITY_MIN = 7; // Adjusted for ~20-30 spaces total
const SPACES_PER_CITY_MAX = 10;
const POSTS_PER_SPACE_MIN = 18;
const POSTS_PER_SPACE_MAX = 22;
const ADDITIONAL_POSTS_PER_USER = 3;
const USERS_PER_SPACE_MIN = 3;
const USERS_PER_SPACE_MAX = 7;

const CITIES = ["Paris", "Lyon", "Marseille", "Lille", "Bordeaux", "Toulouse", "Nice"].slice(0, NUM_CITIES);

const POST_THEMES = [
  {
    type: "theft",
    templates: [
      "Un individu m'a volé une somme d'argent considérable près de {location}. Soyez vigilants, il portait {clothing}.",
      "J'ai été victime d'un vol de {item} dans le quartier de {area}. L'auteur semblait être {description} et s'est enfui vers {direction}.",
      "Attention à vos affaires à {place_suggestion}, on m'y a dérobé {amount}€ hier soir. C'était un homme avec {distinguishing_feature}.",
      "On m'a arraché mon sac contenant {valuable_item} à la station de métro {station_name}. L'agresseur avait un {tattoo_or_scar} visible."
    ],
    details: () => ({
      location: faker.location.streetAddress(false),
      clothing: faker.commerce.productAdjective() + " " + faker.color.human() + " " + faker.commerce.department().toLowerCase(),
      item: faker.commerce.productName(),
      area: faker.location.streetName(),
      description: faker.person.jobDescriptor() + " " + faker.person.gender(),
      direction: faker.location.direction({ abbreviated: false }),
      place_suggestion: faker.company.name() + " " + faker.company.catchPhraseAdjective(),
      amount: faker.finance.amount(50, 500, 0),
      distinguishing_feature: faker.word.noun() + " " + faker.color.human(),
      valuable_item: faker.commerce.productMaterial() + " " + faker.commerce.product(),
      station_name: faker.location.city() + " Central" // Generic station
    })
  },
  {
    type: "spiking",
    templates: [
      "Je crois que quelqu'un a tenté de droguer mon verre au bar '{bar_name}'. J'ai ressenti {symptom} et une {sensation} peu après.",
      "Méfiance à la soirée {event_name}, une amie s'est sentie très mal (nausées et {other_symptom}) après avoir laissé son verre sans surveillance.",
      "Quelqu'un a mis quelque chose dans ma boisson à la discothèque '{club_name}'. Heureusement, j'ai pu partir à temps grâce à {helper}.",
      "J'ai vu quelqu'un verser une substance dans le verre d'une fille au {venue_type} '{venue_name}'. J'ai prévenu la sécurité."
    ],
    details: () => ({
      bar_name: faker.company.name(),
      symptom: faker.word.adjective() + " " + faker.word.noun(),
      sensation: faker.word.noun(),
      event_name: faker.company.bsBuzz() + " Party",
      other_symptom: faker.word.noun(),
      club_name: faker.company.name() + " Club",
      helper: faker.person.firstName(),
      venue_type: faker.word.noun(),
      venue_name: faker.company.name()
    })
  },
  {
    type: "coercion",
    templates: [
      "Lors d'un shooting à {location_shoot}, le photographe {photographer_name} m'a fortement incitée à me déshabiller plus que prévu, c'était très limite.",
      "Un {person_role} nommé {person_name} a essayé de me forcer la main pour des actes que je ne voulais pas faire lors de {event_type} à {city_event}.",
      "J'ai subi des pressions pour me déshabiller de la part de {contact_person_name}, qui se présentait comme {contact_person_role}, pendant un casting bidon à {address}.",
      "Le directeur de {company_name} a eu un comportement déplacé et insistant pour que je {action_coerced} après un entretien."
    ],
    details: () => ({
      location_shoot: faker.location.streetAddress(true),
      photographer_name: faker.person.fullName(),
      person_role: faker.person.jobTitle(),
      person_name: faker.person.fullName(),
      event_type: faker.word.noun() + " " + faker.company.catchPhraseNoun(),
      city_event: faker.location.city(),
      contact_person_name: faker.person.fullName(),
      contact_person_role: faker.person.jobType(),
      address: faker.location.secondaryAddress() + " " + faker.location.streetName(),
      company_name: faker.company.name(),
      action_coerced: faker.word.verb() + " " + faker.word.noun()
    })
  }
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

  // 1. Create Users
  console.log(`Creating ${NUM_USERS} users...`);
  const users: Prisma.UserCreateInput[] = [];
  for (let i = 0; i < NUM_USERS; i++) {
    const firstName = faker.person.firstName('female'); // Explicitly female names
    const lastName = faker.person.lastName();
    users.push({
      email: faker.internet.email({ firstName, lastName, provider: 'fakemail.test' }),
      password: 'password123', // Plain text, assuming hashing happens elsewhere or not needed for seed
      firstName,
      lastName,
      instagram: Math.random() > 0.5 ? `insta_${firstName.toLowerCase()}_${lastName.toLowerCase()}` : null,
      isSuperAdmin: Math.random() < 0.05, // 5% chance of being super admin
    });
  }
  const createdUsers = await prisma.user.createManyAndReturn({ data: users });
  console.log(`${createdUsers.length} users created.`);

  // 2. Create Spaces
  console.log("Creating spaces...");
  const spaces: Prisma.SpaceCreateInput[] = [];
  for (const city of CITIES) {
    const numSpacesInCity = faker.number.int({ min: SPACES_PER_CITY_MIN, max: SPACES_PER_CITY_MAX });
    for (let i = 0; i < numSpacesInCity; i++) {
      spaces.push({
        name: `${city} - SafeZone ${faker.word.noun()} ${i + 1}`,
        description: faker.lorem.sentence(),
        creator: { connect: { id: getRandomElement(createdUsers).id } },
      });
    }
  }
  const createdSpaces = await prisma.space.createManyAndReturn({ data: spaces });
  console.log(`${createdSpaces.length} spaces created.`);

  // 3. Create UserSpaceMemberships
  console.log("Creating user space memberships...");
  const memberships: Prisma.UserSpaceMembershipCreateInput[] = [];
  for (const space of createdSpaces) {
    const spaceUsers = getRandomSubset(createdUsers, USERS_PER_SPACE_MIN, USERS_PER_SPACE_MAX);
    // Ensure creator is admin
    const creatorId = space.createdBy; // In createManyAndReturn, createdBy is just the ID
    if (!spaceUsers.find(u => u.id === creatorId)) {
        const creatorUser = createdUsers.find(u => u.id === creatorId);
        if (creatorUser) spaceUsers.push(creatorUser); // Add if not already selected
    }

    for (const user of spaceUsers) {
      memberships.push({
        user: { connect: { id: user.id } },
        space: { connect: { id: space.id } },
        role: user.id === creatorId ? 'Admin' : (Math.random() < 0.2 ? 'Moderator' : 'Member'),
      });
    }
  }
  // Deduplicate memberships (in case a user was randomly selected and is also creator)
  const uniqueMemberships = memberships.filter((ms, index, self) =>
    index === self.findIndex((m) => m.user.connect.id === ms.user.connect.id && m.space.connect.id === ms.space.connect.id)
  );
  await prisma.userSpaceMembership.createMany({ data: uniqueMemberships });
  console.log(`${uniqueMemberships.length} user space memberships created.`);

  // 4. Create Posts (20 per space)
  console.log("Creating posts per space...");
  let postsCreatedCount = 0;
  for (const space of createdSpaces) {
    const spaceMemberRecords = await prisma.userSpaceMembership.findMany({
      where: { spaceId: space.id },
      include: { user: true },
    });
    const spaceUsers = spaceMemberRecords.map(ms => ms.user);

    if (spaceUsers.length === 0) {
      console.warn(`Space ${space.name} (ID: ${space.id}) has no users, skipping post creation.`);
      continue;
    }

    const numPostsInSpace = faker.number.int({ min: POSTS_PER_SPACE_MIN, max: POSTS_PER_SPACE_MAX });
    for (let i = 0; i < numPostsInSpace; i++) {
      const theme = getRandomElement(POST_THEMES);
      const contentDetails = theme.details();
      const description = interpolate(getRandomElement(theme.templates), contentDetails);
      
      const isAnonymous = Math.random() < 0.15; // 15% chance
      const isAdminOnly = Math.random() < 0.10; // 10% chance
      const author = isAnonymous ? null : getRandomElement(spaceUsers);

      // Create Reported Entity
      const reportedEntityName = faker.person.fullName();
      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: getRandomElement(spaceUsers).id } }, // Can be any user in the space
          space: { connect: { id: space.id } },
          handles: {
            create: [{
              platform: "Instagram",
              handle: `fake_${faker.internet.userName({firstName: reportedEntityName.split(' ')[0], lastName: reportedEntityName.split(' ')[1] || ''}).toLowerCase()}_${faker.string.alphanumeric(4)}`
            }]
          }
        }
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
          severity: getRandomElement(['low', 'medium', 'high']), // Prisma enum values directly
          verificationStatus: getRandomElement(['unverified', 'pending', 'verified', 'disputed']),
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
      select: { spaceId: true }
    });

    if (userMemberships.length === 0) continue; // User might not be in any space

    for (let i = 0; i < ADDITIONAL_POSTS_PER_USER; i++) {
      const spaceId = getRandomElement(userMemberships).spaceId;
      const theme = getRandomElement(POST_THEMES);
      const contentDetails = theme.details();
      const description = interpolate(getRandomElement(theme.templates), contentDetails);

      const reportedEntityName = faker.person.fullName();
      const createdReportedEntity = await prisma.reportedEntity.create({
        data: {
          name: reportedEntityName,
          addedBy: { connect: { id: user.id } },
          space: { connect: { id: spaceId } },
          handles: {
            create: [{
              platform: "Instagram",
              handle: `fake_personal_${faker.internet.userName().toLowerCase()}_${faker.string.alphanumeric(3)}`
            }]
          }
        }
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
