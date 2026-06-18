export type JobSource = 'JustJoin' | 'NoFluffJobs' | 'Bulldogjob';
export type ExperienceLevel = 'junior' | 'mid' | 'senior' | 'lead' | 'expert' | string;
export type JobStatus = 'New' | 'Reviewing' | 'Applied' | 'Rejected';

export interface Job {
  /** Globally unique ID: `<source_prefix>_<original_id>` */
  id: string;
  title: string;
  company: string;
  location: string;
  salaryMin?: number;
  salaryMax?: number;
  currency: string;
  techStack: string[];
  source: JobSource;
  url: string;
  dateScraped: string;
  experience?: ExperienceLevel;
  remote: boolean;
}

export interface ScraperResult {
  source: JobSource;
  jobs: Job[];
  durationMs: number;
  error?: string;
}
