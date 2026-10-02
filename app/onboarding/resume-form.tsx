"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import {
  errorTextClass,
  fieldsetClass,
  hintClass,
  inputClass,
  labelClass,
  sectionTitleClass,
  textareaClass,
} from "@/components/ui/form";
import type { StoredResume } from "@/lib/profile/resume-store";

type Values = {
  headline: string;
  school: string;
  graduationYear: string;
  location: string;
  bio: string;
  experience: string;
  education: string;
  projects: string;
  skillsText: string;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  remoteOnly: boolean;
  hoursPerWeek: string;
};

function toValues(resume: StoredResume): Values {
  return {
    headline: resume.headline,
    school: resume.school,
    graduationYear: resume.graduationYear ? String(resume.graduationYear) : "",
    location: resume.location,
    bio: resume.bio,
    experience: resume.experience,
    education: resume.education,
    projects: resume.projects,
    skillsText: resume.skillsText,
    githubUrl: resume.githubUrl,
    linkedinUrl: resume.linkedinUrl,
    portfolioUrl: resume.portfolioUrl,
    remoteOnly: resume.remoteOnly,
    hoursPerWeek: resume.hoursPerWeek ? String(resume.hoursPerWeek) : "",
  };
}

/**
 * The resume form.
 *
 * Everything here is free text on purpose. Skills are not asked for as a tag
 * list: they are read back out of the prose on the server, so a student writes
 * what they have actually done and matching works off that. The same endpoint
 * will accept a parsed resume later, which is why there is no client-side skill
 * state to keep in sync.
 */
export default function ResumeForm({ resume }: { resume: StoredResume }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(() => toValues(resume));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    // Clear a field's error as soon as it is touched, otherwise the student
    // fixes one field and still sees a wall of stale red.
    setErrors((current) => {
      if (!current[key]) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    setErrors({});

    try {
      const response = await fetch("/api/profile/resume", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          graduationYear: values.graduationYear,
          hoursPerWeek: values.hoursPerWeek,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        fields?: Record<string, string>;
        extracted?: number;
      };

      if (!response.ok) {
        if (data.fields) setErrors(data.fields);
        setError(data.error ?? "Could not save your resume.");
        return;
      }

      const count = data.extracted ?? 0;
      setNotice(
        count
          ? `Saved. We read ${count} skill${count === 1 ? "" : "s"} out of your resume.`
          : "Saved. Add a few more details and we will pick up more skills.",
      );
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className={fieldsetClass}>
        <p className={sectionTitleClass}>The basics</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className={labelClass}>What are you looking for?</span>
            <input
              type="text"
              value={values.headline}
              onChange={(event) => set("headline", event.target.value)}
              placeholder="Backend engineering intern"
              className={`${inputClass} mt-1.5`}
              maxLength={120}
            />
            <span className={hintClass}>One line. We read skills out of this too.</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>School</span>
              <input
                type="text"
                value={values.school}
                onChange={(event) => set("school", event.target.value)}
                className={`${inputClass} mt-1.5`}
                maxLength={120}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Graduation year</span>
              <input
                type="text"
                inputMode="numeric"
                value={values.graduationYear}
                onChange={(event) => set("graduationYear", event.target.value)}
                placeholder="2027"
                className={`${inputClass} mt-1.5`}
              />
              {errors.graduationYear ? (
                <span className={errorTextClass}>{errors.graduationYear}</span>
              ) : null}
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Where you are based</span>
              <input
                type="text"
                value={values.location}
                onChange={(event) => set("location", event.target.value)}
                placeholder="Dublin, Ireland"
                className={`${inputClass} mt-1.5`}
                maxLength={80}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Hours you can give each week</span>
              <input
                type="text"
                inputMode="numeric"
                value={values.hoursPerWeek}
                onChange={(event) => set("hoursPerWeek", event.target.value)}
                placeholder="20"
                className={`${inputClass} mt-1.5`}
              />
              {errors.hoursPerWeek ? (
                <span className={errorTextClass}>{errors.hoursPerWeek}</span>
              ) : null}
            </label>
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={values.remoteOnly}
              onChange={(event) => set("remoteOnly", event.target.checked)}
              className="size-4 shrink-0 accent-primary"
            />
            <span className="text-sm font-semibold">Only show me remote openings</span>
          </label>
        </div>
      </fieldset>

      <fieldset className={fieldsetClass}>
        <p className={sectionTitleClass}>Your story</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className={labelClass}>About you</span>
            <textarea
              value={values.bio}
              onChange={(event) => set("bio", event.target.value)}
              rows={3}
              placeholder="Second-year CS student, mostly backend, keen on data work."
              className={`${textareaClass} mt-1.5`}
              maxLength={600}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Experience</span>
            <textarea
              value={values.experience}
              onChange={(event) => set("experience", event.target.value)}
              rows={5}
              placeholder={"Built a React dashboard for our society's events, backed by a Node API and Postgres.\nInterned at a logistics startup doing Python ETL and some Terraform work."}
              className={`${textareaClass} mt-1.5`}
              maxLength={4000}
            />
            <span className={hintClass}>
              Write it like you would in a CV. We pick the skills out of it.
            </span>
          </label>

          <label className="block">
            <span className={labelClass}>Projects</span>
            <textarea
              value={values.projects}
              onChange={(event) => set("projects", event.target.value)}
              rows={4}
              placeholder="Hackathon project: a Figma-designed app in Next.js with a machine learning model behind the search."
              className={`${textareaClass} mt-1.5`}
              maxLength={2000}
            />
          </label>

          <label className="block">
            <span className={labelClass}>Education</span>
            <textarea
              value={values.education}
              onChange={(event) => set("education", event.target.value)}
              rows={3}
              placeholder="BSc Computer Science, Trinity College Dublin. Coursework in databases, algorithms and statistics."
              className={`${textareaClass} mt-1.5`}
              maxLength={1500}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className={fieldsetClass}>
        <p className={sectionTitleClass}>Skills and links</p>
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className={labelClass}>Skills you want counted</span>
            <textarea
              value={values.skillsText}
              onChange={(event) => set("skillsText", event.target.value)}
              rows={2}
              placeholder="Python, SQL, Figma, Excel"
              className={`${textareaClass} mt-1.5`}
              maxLength={1000}
            />
            <span className={hintClass}>
              Comma separated. Anything here counts even if it is not a skill we recognise.
            </span>
          </label>

          <label className="block">
            <span className={labelClass}>GitHub</span>
            <input
              type="url"
              inputMode="url"
              value={values.githubUrl}
              onChange={(event) => set("githubUrl", event.target.value)}
              placeholder="https://github.com/you"
              className={`${inputClass} mt-1.5`}
              maxLength={200}
            />
            {errors.githubUrl ? <span className={errorTextClass}>{errors.githubUrl}</span> : null}
          </label>

          <label className="block">
            <span className={labelClass}>LinkedIn</span>
            <input
              type="url"
              inputMode="url"
              value={values.linkedinUrl}
              onChange={(event) => set("linkedinUrl", event.target.value)}
              placeholder="https://linkedin.com/in/you"
              className={`${inputClass} mt-1.5`}
              maxLength={200}
            />
            {errors.linkedinUrl ? (
              <span className={errorTextClass}>{errors.linkedinUrl}</span>
            ) : null}
          </label>

          <label className="block">
            <span className={labelClass}>Portfolio or anything else</span>
            <input
              type="url"
              inputMode="url"
              value={values.portfolioUrl}
              onChange={(event) => set("portfolioUrl", event.target.value)}
              placeholder="https://your-site.dev"
              className={`${inputClass} mt-1.5`}
              maxLength={200}
            />
            {errors.portfolioUrl ? (
              <span className={errorTextClass}>{errors.portfolioUrl}</span>
            ) : null}
          </label>
        </div>
      </fieldset>

      {error ? (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl bg-accent/15 px-4 py-3 text-sm font-semibold text-accent">
          {notice}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={`${buttonVariants()} w-full sm:w-auto`}>
        {pending ? "Saving…" : "Save resume"}
      </button>
    </form>
  );
}
