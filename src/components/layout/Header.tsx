import { Suspense } from "react";
import { featuredClubIds, getClub } from "@/data/clubs";
import { SettingsMenu } from "@/components/settings/SettingsMenu";
import { ClubCarousel } from "./ClubCarousel";
import { CompetitionNav } from "./CompetitionNav";
import { Logo } from "./Logo";
import { MainNav, NavPills } from "./MainNav";

export function Header() {
  const featuredClubs = featuredClubIds.map(getClub);

  return (
    <header>
      <div className="border-b border-chrome-line bg-chrome">
        <div className="mx-auto grid max-w-7xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2.5 px-4 py-2.5 sm:px-6 md:grid-cols-[1fr_auto_1fr]">
          <Logo className="col-start-1 row-start-1 justify-self-start" />
          {/* Below md the nav drops to its own full-width, scrollable row. */}
          <div className="col-span-2 col-start-1 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-center">
            <Suspense fallback={<NavPills />}>
              <MainNav />
            </Suspense>
          </div>
          <div className="col-start-2 row-start-1 justify-self-end md:col-start-3">
            <SettingsMenu />
          </div>
        </div>
      </div>

      <div className="border-b border-line bg-bg py-2.5">
        <CompetitionNav />
        <div className="mt-2.5">
          <ClubCarousel clubs={featuredClubs} />
        </div>
      </div>
    </header>
  );
}
