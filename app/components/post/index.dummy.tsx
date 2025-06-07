
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Post, type PostComponentProps } from "."; // Adjust path if necessary
import { type AuthorProfile, type EvidenceMedia, type SpaceInfo, type ReportedUserInfo } from "~/lib/types"; // Adjust path

import { type ReportedEntity } from "~/lib/types"; // Adjust path

// Mock Lucide icons
jest.mock("lucide-react", () => ({
  ...jest.requireActual("lucide-react"),
  MoreHorizontal: () => <div data-testid="more-horizontal-icon" />,
  CircleAlert: () => <div data-testid="circle-alert-icon" />,
  ShieldUser: () => <div data-testid="shield-user-icon" />,
}));

// Mock Tooltip components
jest.mock("~/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip">{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-content">{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-provider">{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div data-testid="tooltip-trigger">{children}</div>,
}));

// Mock react-router-dom Link
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"), // Preserve other exports
  Link: jest.fn(({ to, children, ...props }) => <a href={to} {...props}>{children}</a>),
}));

// Mock data generators
const createMockAuthor = (id: string, name: string, username: string, isAdmin = false, isModerator = false): AuthorProfile => ({
  id,
  name,
  username,
  avatarUrl: `https://via.placeholder.com/40?text=${name.charAt(0)}`,
  isAdmin,
  isModerator,
  role: isAdmin ? "admin" : isModerator ? "moderator" : "user",
});

const createMockMedia = (count: number): EvidenceMedia[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `media${i + 1}`,
    url: `https://via.placeholder.com/600x400?text=Evidence+${i + 1}`,
    type: "image",
    altText: `Evidence image ${i + 1}`,
  }));

const createMockReportedEntity = (name: string, handles?: Array<{ handle: string; platform: string }>): ReportedEntity => ({
  id: `reported-${name.toLowerCase().replace(/\s+/g, "-")}`,
  name,
  handles: handles || [],
});


const defaultAuthor = createMockAuthor("author1", "Default Author", "defaultauthor");
const defaultCurrentUser = { id: "currentUser1", role: "user" as "admin" | "moderator" | "user" };

const mockOnDeletePost = jest.fn();
const mockOnHidePost = jest.fn();
const mockOnUnhidePost = jest.fn();

const testDate = new Date(2023, 9, 26, 10, 0, 0); // October 26, 2023, 10:00:00
const testDateISO = testDate.toISOString();


const basePostProps: PostComponentProps = {
  id: "postTest1",
  author: defaultAuthor,
  createdAt: testDateISO,
  content: "This is a test post.",
  status: "published",
  currentUser: defaultCurrentUser,
  onDeletePost: mockOnDeletePost,
  onHidePost: mockOnHidePost,
  onUnhidePost: mockOnUnhidePost,
};

describe("Post Component", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockOnDeletePost.mockClear();
    mockOnHidePost.mockClear();
    mockOnUnhidePost.mockClear();
  });

  test("renders basic post content and French date", () => {
    render(<Post {...basePostProps} />);
    expect(screen.getByText("This is a test post.")).toBeInTheDocument();
    expect(screen.getByText(defaultAuthor.name)).toBeInTheDocument();
    expect(screen.getByText(`@${defaultAuthor.username}`)).toBeInTheDocument();
    // Date assertion for "26 oct. 2023"
    expect(screen.getByText(/26 oct\. 2023/i)).toBeInTheDocument();
  });

  test("renders author badges (admin and moderator) in French", () => {
    const adminAuthor = createMockAuthor("adminAuthor", "Admin User", "adminuser", true, false);
    const modAuthor = createMockAuthor("modAuthor", "Moderator User", "moduser", false, true);
    
    render(<Post {...basePostProps} author={adminAuthor} />);
    expect(screen.getByText("Administrateur")).toBeInTheDocument();
    
    render(<Post {...basePostProps} author={modAuthor} />);
    expect(screen.getByText("Modérateur")).toBeInTheDocument();
  });

  test("renders status badge (Hidden, Admin Only, Pending) in French", () => {
    render(<Post {...basePostProps} status="hidden" />);
    expect(screen.getByText("Caché")).toBeInTheDocument();

    render(<Post {...basePostProps} status="admin_only" />);
    expect(screen.getByText("Admin Seulement")).toBeInTheDocument();
    
    render(<Post {...basePostProps} status="pending_review" />);
    expect(screen.getByText("En Attente")).toBeInTheDocument();

    // Test for published status (no badge)
    const { queryByText } = render(<Post {...basePostProps} status="published" />);
    expect(queryByText("Caché")).not.toBeInTheDocument();
    expect(queryByText("Admin Seulement")).not.toBeInTheDocument();
    expect(queryByText("En Attente")).not.toBeInTheDocument();
    expect(queryByText("Publié")).not.toBeInTheDocument(); // Assuming "Publié" isn't a badge text
  });

  test("renders media carousel when media is provided", () => {
    const media = createMockMedia(3);
    render(<Post {...basePostProps} media={media} />);
    expect(screen.getAllByRole("img").filter(img => img.getAttribute('alt')?.startsWith("Evidence image"))).toHaveLength(media.length);
  });

  test("opens image dialog on image click", () => {
    const media = createMockMedia(1);
    render(<Post {...basePostProps} media={media} />);
    
    const image = screen.getByAltText("Evidence image 1");
    fireEvent.click(image);
    
    // Dialog content is tricky to assert directly without more specific roles/text
    // The Dialog component in post.tsx uses DialogTitle "Visionneuse d'images" (sr-only)
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByAltText("Evidence image 1")).toBeVisible(); // Check if the clicked image is visible in the dialog
    // Test dialog navigation buttons (if multiple images)
    // fireEvent.click(screen.getByText("Suivant")); 
    // fireEvent.click(screen.getByText("Précédent"));
  });

  // Remove or update the old reportedUserInfo test as it's replaced by reportedEntity
  // test("renders reported user info in French", () => { ... });

  // Remove or update the old space link test as it's replaced by the new button style
  // test("renders space link with React Router Link", () => { ... });

  describe("Reported Entity Display", () => {
    const reportedEntityWithInstagram = createMockReportedEntity("Scammer Person", [{ handle: "scammerInsta", platform: "Instagram" }]);
    const reportedEntityWithTwitter = createMockReportedEntity("Bad Actor", [{ handle: "badTwitter", platform: "Twitter" }]);
    const reportedEntityWithWebsite = createMockReportedEntity("Phishing Site", [{ handle: "phish.com/login", platform: "Website" }]);
    const reportedEntityNoHandles = createMockReportedEntity("Anonymous Entity");
    const reportedEntityFacebookSimpleHandle = createMockReportedEntity("FB User", [{ handle: "fbUserHandle", platform: "Facebook" }]);
    const reportedEntityOtherDomainHandle = createMockReportedEntity("Other User", [{ handle: "some.domain.com/user", platform: "Other" }]);
    const reportedEntityFullUrlHandleInstagram = createMockReportedEntity("Insta Celeb", [{ handle: "http://completely-different.com/instaceleb", platform: "Instagram" }]);
    const reportedEntityFullUrlHandleOther = createMockReportedEntity("Random Profile", [{ handle: "https://another-site.net/profileXYZ", platform: "CustomPlatform" }]);


    test("renders correctly for Instagram (supported platform)", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityWithInstagram} />);
      expect(screen.getByTestId("circle-alert-icon")).toBeInTheDocument();
      const entityNameElement = screen.getByText(reportedEntityWithInstagram.name);
      expect(entityNameElement).toBeInTheDocument();
      expect(entityNameElement).toHaveClass("font-semibold", "text-muted-foreground");
      
      const handleLink = screen.getByText(`@${reportedEntityWithInstagram.handles[0].handle}`);
      expect(handleLink).toBeInTheDocument();
      expect(handleLink).toHaveAttribute("href", `https://www.instagram.com/${reportedEntityWithInstagram.handles[0].handle}`);
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityWithInstagram.handles[0].platform);
    });

    test("renders correctly for Twitter (supported platform)", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityWithTwitter} />);
      const handleLink = screen.getByText(`@${reportedEntityWithTwitter.handles[0].handle}`);
      expect(handleLink).toHaveAttribute("href", `https://twitter.com/${reportedEntityWithTwitter.handles[0].handle}`);
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityWithTwitter.handles[0].platform);
    });
    
    test("renders correctly for Website (supported platform, handle is path only)", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityWithWebsite} />);
      const handleLink = screen.getByText(`@${reportedEntityWithWebsite.handles[0].handle}`);
      expect(handleLink).toHaveAttribute("href", `https://${reportedEntityWithWebsite.handles[0].handle}`); // Expects https:// to be prepended
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityWithWebsite.handles[0].platform);
    });

    test("fallback behavior: prepends https:// for unlisted platform and simple handle", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityFacebookSimpleHandle} />);
      const handleLink = screen.getByText(`@${reportedEntityFacebookSimpleHandle.handles[0].handle}`);
      expect(handleLink).toBeInTheDocument();
      expect(handleLink).toHaveAttribute("href", `https://${reportedEntityFacebookSimpleHandle.handles[0].handle}`);
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityFacebookSimpleHandle.handles[0].platform); // Tooltip shows original platform
    });

    test("fallback behavior: prepends https:// for 'Other' platform and domain/path handle", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityOtherDomainHandle} />);
      const handleLink = screen.getByText(`@${reportedEntityOtherDomainHandle.handles[0].handle}`);
      expect(handleLink).toBeInTheDocument();
      expect(handleLink).toHaveAttribute("href", `https://${reportedEntityOtherDomainHandle.handles[0].handle}`);
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityOtherDomainHandle.handles[0].platform);
    });

    test("uses handle directly if it's a full URL (http), even for a supported platform", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityFullUrlHandleInstagram} />);
      const handleLink = screen.getByText(`@${reportedEntityFullUrlHandleInstagram.handles[0].handle}`);
      expect(handleLink).toBeInTheDocument();
      expect(handleLink).toHaveAttribute("href", reportedEntityFullUrlHandleInstagram.handles[0].handle); // Uses the full URL directly
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityFullUrlHandleInstagram.handles[0].platform);
    });

    test("uses handle directly if it's a full URL (https) for an unlisted platform", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityFullUrlHandleOther} />);
      const handleLink = screen.getByText(`@${reportedEntityFullUrlHandleOther.handles[0].handle}`);
      expect(handleLink).toBeInTheDocument();
      expect(handleLink).toHaveAttribute("href", reportedEntityFullUrlHandleOther.handles[0].handle); // Uses the full URL directly
      expect(screen.getByTestId("tooltip-content")).toHaveTextContent(reportedEntityFullUrlHandleOther.handles[0].platform);
    });
    
    test("renders reported entity info without handle link if no handles are present", () => {
      render(<Post {...basePostProps} reportedEntity={reportedEntityNoHandles} />);
      expect(screen.getByTestId("circle-alert-icon")).toBeInTheDocument();
      expect(screen.getByText(reportedEntityNoHandles.name)).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument(); // No links for handles
      expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument();
    });

    test("does not render reported entity section if reportedEntity is null", () => {
      render(<Post {...basePostProps} reportedEntity={null} />);
      expect(screen.queryByTestId("circle-alert-icon")).not.toBeInTheDocument();
      expect(screen.queryByText(/Scammer Person/i)).not.toBeInTheDocument(); // Check against a known name
    });
  });

  describe("Space Link Display", () => {
    const spaceInfo: SpaceInfo = { id: "s1", name: "Justice League", url: "/spaces/justice-league" };

    test("renders space link as a ghost button with icon, name, and correct URL", () => {
      render(<Post {...basePostProps} space={spaceInfo} />);
      
      const buttonLink = screen.getByRole("link", { name: spaceInfo.name }); // The link is inside the button
      expect(buttonLink).toBeInTheDocument();
      expect(buttonLink).toHaveAttribute("href", spaceInfo.url);
      
      // Check for button specific classes (approximating ghost variant)
      // This depends on how your Button component implements variants.
      // If it adds a specific class like 'button-ghost', test for that.
      // For now, check it's a link and has the icon.
      const buttonElement = buttonLink.closest('a'); // Mock renders Link as <a>
      expect(buttonElement).toBeInTheDocument();

      // Check for icon
      expect(screen.getByTestId("shield-user-icon")).toBeInTheDocument();
      expect(screen.getByText(spaceInfo.name)).toBeInTheDocument();
    });

    test("does not render space link button if space is null", () => {
      render(<Post {...basePostProps} space={null} />);
      expect(screen.queryByRole("link", { name: /Justice League/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId("shield-user-icon")).not.toBeInTheDocument();
    });
  });

  describe("Contextual Menu (Admin) in French", () => {
    const adminUser = { id: "adminUser1", role: "admin" as "admin" | "moderator" | "user" };

    test("shows 'Supprimer le post (Admin)' and 'Masquer le post (Admin)' for admin", () => {
      render(<Post {...basePostProps} currentUser={adminUser} status="published" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Supprimer le post (Admin)")).toBeInTheDocument();
      expect(screen.getByText("Masquer le post (Admin)")).toBeInTheDocument();
    });

    test("shows 'Afficher le post (Admin)' for admin if post is hidden", () => {
      render(<Post {...basePostProps} currentUser={adminUser} status="hidden" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Supprimer le post (Admin)")).toBeInTheDocument();
      expect(screen.getByText("Afficher le post (Admin)")).toBeInTheDocument();
    });
    
    test("'Supprimer le post (Admin)' calls onDeletePost for admin", () => {
      render(<Post {...basePostProps} currentUser={adminUser} />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Supprimer le post (Admin)"));
      expect(mockOnDeletePost).toHaveBeenCalledWith(basePostProps.id);
    });

    test("'Masquer le post (Admin)' calls onHidePost for admin", () => {
      render(<Post {...basePostProps} currentUser={adminUser} status="published" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Masquer le post (Admin)"));
      expect(mockOnHidePost).toHaveBeenCalledWith(basePostProps.id);
    });

    test("'Afficher le post (Admin)' calls onUnhidePost for admin if post is hidden", () => {
      render(<Post {...basePostProps} currentUser={adminUser} status="hidden" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Afficher le post (Admin)"));
      expect(mockOnUnhidePost).toHaveBeenCalledWith(basePostProps.id);
    });
  });

  describe("Contextual Menu (Author/User) in French", () => {
    const authorUser = { id: basePostProps.author.id, role: "user" as "admin" | "moderator" | "user" };

    test("shows 'Supprimer le post' for author (user role)", () => {
      render(<Post {...basePostProps} currentUser={authorUser} />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Supprimer le post")).toBeInTheDocument();
      expect(screen.queryByText("Masquer le post (Admin)")).not.toBeInTheDocument();
      expect(screen.queryByText("Afficher le post (Admin)")).not.toBeInTheDocument();
      expect(screen.queryByText("Masquer le post (Mod)")).not.toBeInTheDocument();
      expect(screen.queryByText("Afficher le post (Mod)")).not.toBeInTheDocument();
    });

    test("'Supprimer le post' calls onDeletePost for author", () => {
      render(<Post {...basePostProps} currentUser={authorUser} />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Supprimer le post"));
      expect(mockOnDeletePost).toHaveBeenCalledWith(basePostProps.id);
    });
    
    test("shows 'Aucune action disponible' for non-author/non-admin user if no actions passed", () => {
      const nonAuthorUser = { id: "someOtherUser", role: "user" as "admin" | "moderator" | "user" };
      render(<Post {...basePostProps} currentUser={nonAuthorUser} status="published" onDeletePost={undefined} onHidePost={undefined} onUnhidePost={undefined} />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Aucune action disponible")).toBeInTheDocument();
    });
  });
  
  describe("Contextual Menu (Moderator) in French", () => {
    const moderatorUser = { id: "moderatorUser1", role: "moderator" as "admin" | "moderator" | "user" };

    test("shows 'Masquer le post (Mod)' for moderator (non-author)", () => {
      render(<Post {...basePostProps} currentUser={moderatorUser} status="published" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Masquer le post (Mod)")).toBeInTheDocument();
      expect(screen.queryByText("Supprimer le post")).not.toBeInTheDocument();
      expect(screen.queryByText("Supprimer le post (Admin)")).not.toBeInTheDocument();
    });

    test("shows 'Afficher le post (Mod)' for moderator if post is hidden (non-author)", () => {
      render(<Post {...basePostProps} currentUser={moderatorUser} status="hidden" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Afficher le post (Mod)")).toBeInTheDocument();
    });

    test("shows 'Supprimer le post' and 'Masquer le post (Mod)' if moderator is also the author", () => {
      const modAuthorUser = { id: basePostProps.author.id, role: "moderator" as "admin" | "moderator" | "user" };
      render(<Post {...basePostProps} currentUser={modAuthorUser} status="published" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      expect(screen.getByText("Supprimer le post")).toBeInTheDocument();
      expect(screen.getByText("Masquer le post (Mod)")).toBeInTheDocument();
    });

    test("'Masquer le post (Mod)' calls onHidePost for moderator", () => {
      render(<Post {...basePostProps} currentUser={moderatorUser} status="published" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Masquer le post (Mod)"));
      expect(mockOnHidePost).toHaveBeenCalledWith(basePostProps.id);
    });

    test("'Afficher le post (Mod)' calls onUnhidePost for moderator if post is hidden", () => {
      render(<Post {...basePostProps} currentUser={moderatorUser} status="hidden" />);
      fireEvent.click(screen.getByTestId("more-horizontal-icon"));
      fireEvent.click(screen.getByText("Afficher le post (Mod)"));
      expect(mockOnUnhidePost).toHaveBeenCalledWith(basePostProps.id);
    });
  });

});
