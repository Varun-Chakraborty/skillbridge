"use client";
import { Bell, Bookmark, Check, Menu, Search, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import hackathonImage from "@/assets/hacknorth-team.jpg";
import designSprintImage from "@/assets/design-sprint.jpg";
import internshipImage from "@/assets/neuralforge-internship.jpg";
import Image from "next/image";

type OpportunityType = "Internship" | "Hackathon" | "Workshop";

const opportunities = [
  {
    id: 1,
    type: "Internship" as OpportunityType,
    title: "NeuralForge AI Intern",
    detail: "Remote · 12 weeks · Full-time",
    match: 92,
    tags: ["Python", "ML", "PyTorch"],
    image: internshipImage,
    alt: "Laptop and study notes for an AI internship",
    tone: "bg-primary text-primary-foreground",
  },
  {
    id: 2,
    type: "Hackathon" as OpportunityType,
    title: "HackNorth 2026",
    detail: "Bengaluru · 48 hours · ₹8L prize",
    match: 85,
    tags: ["Web", "Design", "Fintech"],
    image: hackathonImage,
    alt: "Students collaborating at a hackathon",
    tone: "bg-accent text-accent-foreground",
  },
  {
    id: 3,
    type: "Workshop" as OpportunityType,
    title: "Product Design Sprint",
    detail: "Online · 2 days · Certificate",
    match: 78,
    tags: ["Figma", "UX", "Prototyping"],
    image: designSprintImage,
    alt: "Student sketching mobile wireframes",
    tone: "bg-warning text-foreground",
  },
];

const teamMembers = [
  {
    name: "Maya K.",
    skills: "Backend · Go · 88% skill overlap",
    initials: "MK",
    tone: "bg-accent",
  },
  {
    name: "Devon L.",
    skills: "Design · Figma · 81% skill overlap",
    initials: "DL",
    tone: "bg-highlight",
  },
];

export default function Dashboard() {
  const [filter, setFilter] = useState<"All" | OpportunityType>("All");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<number[]>([2]);
  const [applied, setApplied] = useState<number[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);

  const visible = useMemo(
    () =>
      opportunities.filter((item) => {
        const matchesFilter = filter === "All" || item.type === filter;
        const haystack = `${item.title} ${item.type} ${item.tags.join(" ")}`.toLowerCase();
        return matchesFilter && haystack.includes(query.toLowerCase());
      }),
    [filter, query],
  );

  const toggleSaved = (id: number) =>
    setSaved((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  return (
    <div className="min-h-screen bg-background font-body text-foreground">
      <header className="sticky top-0 z-30 border-b-2 border-foreground bg-background/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground">
              S
            </div>
            <span className="font-display text-xl font-bold">SkillBridge</span>
          </div>
          <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main navigation">
            {["Home", "Discover", "Teams", "Portfolio"].map((item, index) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${index === 0 ? "bg-foreground text-background" : "hover:bg-muted"}`}
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-3 sm:flex">
            <label className="relative hidden lg:block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search opportunities…"
                className="w-56 rounded-full border-2 border-border bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-foreground"
              />
            </label>
            <Button
              variant="outline"
              size="icon"
              aria-label="Show notifications"
              onClick={() => setNoticeOpen(!noticeOpen)}
              className="relative"
            >
              <Bell className="size-4" />
              <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">
                3
              </span>
            </Button>
            <div className="flex items-center gap-2 rounded-full border-2 border-border bg-card py-1.5 pl-2 pr-4">
              <div className="grid size-8 place-items-center rounded-full bg-feature text-sm font-bold text-feature-foreground">
                AR
              </div>
              <span className="text-sm font-semibold">Aisha R.</span>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="ml-auto sm:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
        {menuOpen && (
          <div className="border-t-2 border-border bg-card p-4 sm:hidden">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search opportunities…"
              className="w-full rounded-full border-2 border-border px-4 py-2 text-sm outline-none"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {["Home", "Discover", "Teams", "Portfolio"].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="rounded-full bg-muted px-3 py-2 text-center text-sm font-semibold"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-5">
        <section id="home" className="grid items-end gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="inline-block rounded-full bg-secondary px-3 py-1.5 text-xs font-bold uppercase">
              Saturday · 12 new matches
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1] sm:text-5xl md:text-6xl">
              Good evening,
              <br />
              <span className="text-primary">Aisha</span> — ready to
              <br />
              <span className="text-feature">build something</span> great?
            </h1>
            <p className="mt-4 max-w-md text-lg text-muted-foreground">
              You’re 3 steps from landing your next internship. Here’s what’s moving today.
            </p>
          </div>
          <div className="lg:col-span-5">
            <div className="rounded-3xl bg-feature p-6 text-feature-foreground shadow-studio">
              <p className="text-xs font-semibold uppercase opacity-70">Match of the day</p>
              <h2 className="mt-2 font-display text-2xl font-bold">NeuralForge AI Intern</h2>
              <p className="mt-1 text-sm opacity-80">92% skill match · Remote · 12 weeks</p>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() =>
                    document.getElementById("discover")?.scrollIntoView({ behavior: "smooth" })
                  }
                >
                  View role
                </Button>
                <Button className="flex-1" onClick={() => toggleSaved(1)}>
                  {saved.includes(1) ? (
                    <>
                      <Check className="size-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Bookmark className="size-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4"
          aria-label="Student progress"
        >
          {[
            ["18", "Applications", "text-primary"],
            [String(saved.length), "Bookmarked", "text-accent"],
            ["4", "Team invites", "text-feature"],
            ["92%", "Profile strength", "text-warning"],
          ].map(([value, label, tone]) => (
            <div key={label} className="rounded-2xl border-2 border-border bg-card p-4">
              <p className={`font-display text-3xl font-bold ${tone}`}>{value}</p>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
            </div>
          ))}
        </section>

        <section id="discover" className="mt-10 scroll-mt-24">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">
                Matched to your skills
              </p>
              <h2 className="font-display text-3xl font-bold">Explore opportunities</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["All", "Internship", "Hackathon", "Workshop"] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={filter === option ? "ink" : "outline"}
                  onClick={() => setFilter(option)}
                >
                  {option === "All" ? "All" : `${option}s`}
                </Button>
              ))}
            </div>
          </div>
          {visible.length ? (
            <div className="mt-6 grid gap-5 md:grid-cols-3">
              {visible.map((item) => (
                <article
                  key={item.id}
                  className="card-rise flex overflow-hidden rounded-3xl border-2 border-border bg-card md:flex-col"
                >
                  <div className="relative w-32 shrink-0 sm:w-44 md:w-full">
                    <Image
                      src={item.image}
                      alt={item.alt}
                      loading="lazy"
                      width={1088}
                      height={608}
                      className="h-full min-h-44 w-full object-cover md:aspect-video md:min-h-0"
                    />
                    <span
                      className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-bold ${item.tone}`}
                    >
                      {item.type}
                    </span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="absolute right-3 top-3"
                      aria-label={`${saved.includes(item.id) ? "Remove" : "Save"} ${item.title}`}
                      onClick={() => toggleSaved(item.id)}
                    >
                      <Bookmark
                        className={`size-4 ${saved.includes(item.id) ? "fill-current" : ""}`}
                      />
                    </Button>
                  </div>
                  <div className="flex min-w-0 grow flex-col p-4 sm:p-5">
                    <h3 className="font-display text-lg font-bold sm:text-xl">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-feature"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t-2 border-border pt-4">
                      <span className="text-sm font-bold text-accent">{item.match}% match</span>
                      <Button
                        size="sm"
                        variant={applied.includes(item.id) ? "secondary" : "ink"}
                        onClick={() =>
                          setApplied((current) =>
                            current.includes(item.id) ? current : [...current, item.id],
                          )
                        }
                      >
                        {applied.includes(item.id) ? (
                          <>
                            <Check className="size-4" />
                            Applied
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border-2 border-dashed border-border bg-card p-10 text-center">
              <Search className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 font-display text-xl font-bold">No matches found</p>
              <p className="text-sm text-muted-foreground">Try another search or category.</p>
            </div>
          )}
        </section>

        <section id="teams" className="mt-10 grid scroll-mt-24 gap-6 lg:grid-cols-12">
          <div className="rounded-3xl border-2 border-border bg-card p-5 sm:p-6 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-2xl font-bold">Build your team</h2>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-feature">
                Complementary skills
              </span>
            </div>
            <div className="mt-5 space-y-3">
              {teamMembers.map((member) => (
                <div
                  key={member.name}
                  className="flex items-center gap-3 rounded-2xl bg-background p-3 sm:gap-4"
                >
                  <div
                    className={`grid size-11 shrink-0 place-items-center rounded-full font-bold text-primary-foreground ${member.tone}`}
                  >
                    {member.initials}
                  </div>
                  <div className="min-w-0 grow">
                    <p className="font-bold">{member.name}</p>
                    <p className="text-xs text-muted-foreground sm:text-sm">{member.skills}</p>
                  </div>
                  <Button
                    variant={invited.includes(member.name) ? "secondary" : "grape"}
                    size="sm"
                    onClick={() =>
                      setInvited((current) =>
                        current.includes(member.name) ? current : [...current, member.name],
                      )
                    }
                  >
                    {invited.includes(member.name) ? (
                      <>
                        <Check className="size-4" />
                        Invited
                      </>
                    ) : (
                      "Invite"
                    )}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl bg-foreground p-6 text-background lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-2xl font-bold">Notifications</h2>
              <Sparkles className="size-5 text-secondary" />
            </div>
            <div className="mt-4 space-y-4">
              {[
                ["bg-primary", "NeuralForge shortlisted you for a technical interview."],
                ["bg-warning", "Maya K. accepted your team invite for HackNorth."],
                ["bg-accent", "New badge earned: Full-Stack Builder."],
              ].map(([tone, text]) => (
                <div key={text} className="flex items-start gap-3">
                  <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tone}`} />
                  <p className="text-sm opacity-85">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <footer
          id="portfolio"
          className="mt-12 flex flex-col gap-2 border-t-2 border-foreground py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p>SkillBridge · Turn learning into momentum.</p>
          <p>Frontend preview with sample student data</p>
        </footer>
      </main>
      {noticeOpen && (
        <div className="fixed right-4 top-20 z-40 w-[calc(100%-2rem)] max-w-sm rounded-2xl border-2 border-foreground bg-card p-4 shadow-studio">
          <div className="flex items-center justify-between">
            <p className="font-display font-bold">You’re all caught up</p>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setNoticeOpen(false)}
              aria-label="Close notifications"
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Three updates are highlighted in your activity panel.
          </p>
        </div>
      )}
    </div>
  );
}
