/**
 * DeveloperProfile Entity
 *
 * Represents a developer identified as a code owner or recent contributor
 * to files relevant to the analysis.
 */

export interface DeveloperProfile {
	/** GitHub username */
	githubUsername: string;
	/** Developer's display name from Git commits */
	name: string;
	/** Email from Git commits (used for Slack mapping) */
	email: string;
	/** Slack User ID (resolved via email mapping) */
	slackUserId?: string;
	/** Number of recent commits to the relevant files */
	commitCount: number;
	/** Date of the most recent commit to the relevant files */
	lastCommitDate: string;
	/** List of files this developer recently modified */
	recentFiles: string[];
}

/**
 * Represents the result of an owner lookup for a set of files.
 */
export interface OwnerLookupResult {
	/** The primary recommended owner */
	primaryOwner: DeveloperProfile;
	/** Other significant contributors */
	otherContributors: DeveloperProfile[];
}
