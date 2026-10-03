import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Compass,
  Rocket,
  Users,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import ThemeToggle from "@/components/theme-toggle";

import hackathonImage from "@/assets/hacknorth-team.jpg";
import designSprintImage from "@/assets/design-sprint.jpg";
import internshipImage from "@/assets/neuralforge-internship.jpg";

const pillars = [
  {
    icon: Compass,
    title: "Matched, not filtered",
    body: "Every listing is scored against the skills you actually have, so the top of your feed is the work you are ready for.",
    tone: "bg-primary text-primary-foreground",
    chip: "bg-primary/12 text-primary",
  },
  {
    icon: Users,
    title: "Find your missing piece",
    body: "We surface collaborators whose skills complement yours, so a solo idea becomes a shipped project before the deadline.",
    tone: "bg-feature text-feature-foreground",
    chip: "bg-feature/12 text-feature",
  },
  {
    icon: Rocket,
    title: "Proof, not just listings",
    body: "Applications, badges, and team contributions build a portfolio you can show a hiring manager without writing a word.",
    tone: "bg-accent text-accent-foreground",
    chip: "bg-accent/15 text-foreground",
  },
];

const opportunityKinds = [
  {
    type: "Internship",
    title: "NeuralForge AI Intern",
    detail: "Remote · 12 weeks · Full-time",
    tags: ["Python", "ML", "PyTorch"],
    image: internshipImage,
    alt: "Laptop and study notes for an AI internship",
    tone: "bg-primary text-primary-foreground",
  },
  {
    type: "Hackathon",
    title: "HackNorth 2026",
    detail: "Bengaluru · 48 hours · ₹8L prize",
    tags: ["Web", "Design", "Fintech"],
    image: hackathonImage,
    alt: "Students collaborating at a hackathon",
    tone: "bg-accent text-accent-foreground",
  },
  {
    type: "Workshop",
    title: "Product Design Sprint",
    detail: "Online · 2 days · Certificate",
    tags: ["Figma", "UX", "Prototyping"],
    image: designSprintImage,
    alt: "Student sketching mobile wireframes",
    tone: "bg-warning text-warning-foreground",
  },
];

const steps = [
  {
    title: "Map your skills",
    body: "Import a CV or pick from a checklist. We turn it into a skill profile you can keep current.",
  },
  {
    title: "Review your matches",
    body: "Openings, hackathons, and workshops arrive ranked by fit, with the reasoning shown.",
  },
  {
    title: "Apply and team up",
    body: "Track applications in one place and invite collaborators from the people you match with.",
  },
];

const guarantees = [
  {
    icon: BadgeCheck,
    title: "Reviewed before it lands",
    body: "Every listing is checked by someone on the team before it reaches your feed.",
  },
  {
    icon: CalendarClock,
    title: "Deadlines kept current",
    body: "Closing dates are tracked for you, so nothing you shortlisted quietly expires.",
  },
  {
    icon: Users,
    title: "Real collaborators",
    body: "Teammates are students with the complementary skills your project is missing.",
  },
  {
    icon: Compass,
    title: "No black box",
    body: "You see why each match was surfaced, and can turn any signal off.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
              S
            </span>
            <span className="font-display text-xl font-bold">SkillBridge</span>
          </Link>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {["Why SkillBridge", "Opportunities", "How it works"].map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Sign in
            </Link>
            <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pt-14 pb-16 sm:px-5 sm:pt-20 sm:pb-24">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <span className="inline-block rounded-full bg-secondary px-3 py-1.5 text-xs font-bold uppercase">
                Now onboarding for 2026 cohorts
              </span>
              <h1 className="mt-5 font-display text-5xl font-bold leading-[0.95] sm:text-6xl lg:text-7xl">
                Turn what you
                <br />
                <span className="text-primary">learn</span> into
                <br />
                <span className="text-feature">momentum</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg text-muted-foreground">
                SkillBridge matches students with verified internships, hackathons, and
                workshops, then helps you assemble the team to actually win them.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/dashboard" className={buttonVariants({ size: "default" })}>
                  Browse matches
                  <ArrowRight className="size-4" />
                </Link>
                <a href="#how-it-works" className={buttonVariants({ variant: "outline" })}>
                  See how it works
                </a>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Free for students. No credit card, no placement fee.
              </p>
            </div>

            <div className="lg:col-span-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="card-rise overflow-hidden rounded-3xl border-2 border-border bg-card sm:col-span-2">
                  <div className="relative">
                    <Image
                      src={internshipImage}
                      alt="Laptop and study notes for an AI internship"
                      preload
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 550px"
                      className="aspect-video w-full object-cover"
                    />
                    <span className="absolute left-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                      Verified
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <h2 className="font-display text-xl font-bold">NeuralForge AI Intern</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Remote · 12 weeks · Full-time
                      </p>
                    </div>
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-feature text-feature-foreground">
                      <BadgeCheck className="size-5" />
                    </span>
                  </div>
                </div>

                <div className="rounded-3xl bg-feature p-5 text-feature-foreground shadow-studio">
                  <CalendarClock className="size-5" />
                  <p className="mt-8 font-display text-2xl font-bold">One weekly digest</p>
                  <p className="mt-2 text-sm">
                    New matches and closing deadlines, summarised. No daily noise.
                  </p>
                </div>

                <div className="rounded-3xl border-2 border-border bg-card p-5">
                  <p className="text-xs font-bold uppercase text-muted-foreground">
                    What we match on
                  </p>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {["Skills", "Interests", "Location", "Timezone", "Commitment"].map(
                      (signal) => (
                        <span
                          key={signal}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature"
                        >
                          {signal}
                        </span>
                      ),
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Adjust any of these, or switch a match off, at any time.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="What SkillBridge guarantees"
          className="border-y-2 border-foreground bg-secondary/40"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-5 lg:grid-cols-4">
            {guarantees.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <span className="grid size-10 place-items-center rounded-2xl bg-foreground text-background">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="why-skillbridge" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-5 sm:py-24">
          <p className="text-xs font-bold uppercase text-muted-foreground">
            Why SkillBridge
          </p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl sm:leading-[1.05]">
            Job boards list openings. We pick the ones that fit.
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {pillars.map(({ icon: Icon, title, body, tone, chip }, index) => (
              <article
                key={title}
                className="card-rise flex flex-col rounded-3xl border-2 border-border bg-card p-6"
              >
                <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}>
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-5 font-display text-xl font-bold">{title}</h3>
                <p className="mt-2 grow text-sm text-muted-foreground">{body}</p>
                <span
                  className={`mt-6 self-start rounded-full px-3 py-1 text-xs font-bold ${chip}`}
                >
                  Step {index + 1} of 3
                </span>
              </article>
            ))}
          </div>
        </section>

        <section
          id="opportunities"
          className="scroll-mt-24 border-y-2 border-foreground bg-card/60"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 sm:py-24">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-muted-foreground">
                  This week on SkillBridge
                </p>
                <h2 className="mt-2 font-display text-3xl font-bold sm:text-5xl sm:leading-[1.05]">
                  Three things worth your weekend
                </h2>
              </div>
              <Link href="/dashboard" className={buttonVariants({ variant: "ink" })}>
                View all matches
                <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {opportunityKinds.map((item) => (
                <article
                  key={item.title}
                  className="card-rise overflow-hidden rounded-3xl border-2 border-border bg-card"
                >
                  <div className="relative">
                    <Image
                      src={item.image}
                      alt={item.alt}
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="aspect-video w-full object-cover"
                    />
                    <span
                      className={`absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-bold ${item.tone}`}
                    >
                      {item.type}
                    </span>
                  </div>
                  <div className="flex flex-col p-5">
                    <h3 className="font-display text-lg font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-5 sm:py-24">
          <p className="text-xs font-bold uppercase text-muted-foreground">How it works</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold sm:text-5xl sm:leading-[1.05]">
            Three steps between your profile and an offer
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-3xl border-2 border-border bg-card p-6"
              >
                <span className="font-display text-5xl font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-4 font-display text-xl font-bold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-5 sm:pb-24">
          <div className="rounded-3xl bg-foreground p-8 text-background sm:p-12">
            <div className="grid items-center gap-8 lg:grid-cols-12">
              <div className="lg:col-span-8">
                <h2 className="font-display text-3xl font-bold sm:text-4xl">
                  Stop scrolling job boards. Start matching.
                </h2>
                <p className="mt-3 max-w-xl text-background/80">
                  Build your skill profile in five minutes and see the openings you are already
                  qualified for.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:col-span-4 lg:justify-end">
                <Link href="/dashboard" className={buttonVariants({ variant: "secondary" })}>
                  Create your profile
                </Link>
                <Link
                  href="/dashboard"
                  className={buttonVariants({ variant: "outline", className: "bg-transparent text-background hover:bg-background/10" })}
                >
                  Explore the demo
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-foreground">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p>SkillBridge · Turn learning into momentum.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-5">
            <Link href="/dashboard" className="font-semibold hover:text-foreground">
              Dashboard
            </Link>
            <a href="#opportunities" className="hover:text-foreground">
              Opportunities
            </a>
            <a href="#how-it-works" className="hover:text-foreground">
              How it works
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}