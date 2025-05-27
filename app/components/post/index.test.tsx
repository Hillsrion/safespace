import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Post, type PostComponentProps } from "."; // Adjust path if necessary
import { type AuthorProfile, type EvidenceMedia, type SpaceInfo, type ReportedUserInfo } from "~/lib/types"; // Adjust path

// Mock Lucide icons
jest.mock("lucide-react", () => ({
  ...jest.requireActual("lucide-react"),
  MoreHorizontal: () => <div data-testid="more-horizontal-icon" />,
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
});

const createMockMedia = (count: number): EvidenceMedia[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `media${i + 1}`,
    url: `https://via.placeholder.com/600x400?text=Evidence+${i + 1}`,
    type: "image",
    altText: `Evidence image ${i + 1}`,
  }));

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

    render(<Post {...basePostProps} status="published" />); // Test for published status as well
    expect(screen.getByText("Publié")).toBeInTheDocument();
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
    // Test dialog navigation buttons
    fireEvent.click(screen.getByText("Suivant")); // Assuming there's more than one image if these buttons show
    fireEvent.click(screen.getByText("Précédent"));
  });

  test("renders reported user info in French", () => {
    const reportedUserInfo: ReportedUserInfo = {
      user: createMockAuthor("reported1", "Reported Person", "reportedperson"),
      platformUrl: "http://instagram.com/reported",
    };
    render(<Post {...basePostProps} reportedUserInfo={reportedUserInfo} />);
    expect(screen.getByText(`Signalé : ${reportedUserInfo.user.name}`)).toBeInTheDocument();
    expect(screen.getByText("Profil Instagram")).toHaveAttribute("href", reportedUserInfo.platformUrl);
  });

  test("renders space link with React Router Link", () => {
    const space: SpaceInfo = { id: "space1", name: "Test Space", url: "/space/test" };
    render(<Post {...basePostProps} space={space} />);
    const spaceLinkElement = screen.getByText(`Espace : ${space.name}`);
    expect(spaceLinkElement).toBeInTheDocument();
    expect(spaceLinkElement).toHaveAttribute("href", space.url); // Check 'href' due to mock
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
