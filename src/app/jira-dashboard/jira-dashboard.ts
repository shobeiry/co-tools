import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToTimePipe } from '../shared/pipes/to-time-pipe';

interface Worklog {
  author: { displayName: string; emailAddress: string };
  timeSpentSeconds: number;
  comment: string | { content: any[] };
  started: string;
  issueId: string;
}

interface CategoryStats {
  dev: number;
  test: number;
  review: number;
  untagged: number;
}

interface UserReport {
  displayName: string;
  totalTimeSeconds: number;
  categories: CategoryStats;
  activeDays: Record<string, number>;
  issuesCount: Set<string>;
  logsByCategory: Record<string, Worklog[]>;
  logsByDate: Record<string, Worklog[]>;
}

@Component({
  selector: 'app-jira-dashboard',
  imports: [CommonModule, FormsModule, ToTimePipe],
  templateUrl: './jira-dashboard.html',
  styleUrl: './jira-dashboard.scss',
})
export class JiraDashboard {
  username = '';
  password = '';
  startDate = '';
  endDate = '';
  targetUsers = '';

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  reportData = signal<Record<string, UserReport> | null>(null);
  isDarkMode = signal<boolean>(false);
  searchQuery = signal<string>('');
  expandedUsers = signal<Record<string, boolean>>({});

  // -- سیگنال جدید برای مدیریت مودال جزئیات --
  selectedDetail = signal<{ title: string; logs: Worklog[] } | null>(null);

  private readonly KEYWORDS = ['dev', 'test', 'review'];

  filteredReports = computed(() => {
    const data = this.reportData();
    if (!data) return null;

    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return data;

    const filtered: Record<string, UserReport> = {};
    for (const [email, report] of Object.entries(data)) {
      if (report.displayName.toLowerCase().includes(query) || email.toLowerCase().includes(query)) {
        filtered[email] = report;
      }
    }
    return filtered;
  });

  async generateReport() {
    if (!this.password || !this.startDate || !this.endDate) {
      this.error.set('لطفاً تاریخ شروع، پایان و رمز عبور/توکن را وارد کنید.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.reportData.set(null);
    this.searchQuery.set('');
    this.expandedUsers.set({});
    this.selectedDetail.set(null);

    try {
      const realWorklogs = await this.fetchJiraWorklogs();
      const processed = this.processWorklogs(realWorklogs);
      this.reportData.set(processed);
    } catch (err: any) {
      console.error(err);
      this.error.set(err?.message || 'خطا در دریافت اطلاعات. لطفا دسترسی‌ها را بررسی کنید.');
    } finally {
      this.isLoading.set(false);
    }
  }


  private async fetchJiraWorklogs(): Promise<Worklog[]> {
    const baseUrl = '/jira-api';
    const authHeader = this.username
      ? 'Basic ' + btoa(`${this.username}:${this.password}`)
      : 'Bearer ' + this.password;

    const headers = {
      Authorization: authHeader,
      Accept: 'application/json',
      'X-Atlassian-Token': 'no-check',
    };

    const meResponse = await fetch(`${baseUrl}/rest/api/2/myself`, { method: 'GET', headers });
    if (!meResponse.ok) {
      throw new Error('نام کاربری، رمز عبور یا توکن وارد شده نامعتبر است.');
    }

    const jql = `worklogDate >= "${this.startDate}" AND worklogDate <= "${this.endDate}"`;
    const searchParams = new URLSearchParams({
      jql: jql,
      fields: 'summary',
      maxResults: '1000',
    });

    const searchResponse = await fetch(`${baseUrl}/rest/api/2/search?${searchParams.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!searchResponse.ok) {
      throw new Error(`خطای سرور جیرا هنگام جستجو (کد: ${searchResponse.status})`);
    }

    const searchData = await searchResponse.json();
    const extractedWorklogs: Worklog[] = [];

    if (!searchData.issues || searchData.issues.length === 0) {
      return extractedWorklogs;
    }

    const fetchWorklogsPromises = searchData.issues.map(async (issue: any) => {
      try {
        const wlResponse = await fetch(`${baseUrl}/rest/api/2/issue/${issue.key}/worklog`, {
          method: 'GET',
          headers,
        });

        if (!wlResponse.ok) return;

        const wlData = await wlResponse.json();

        if (wlData && wlData.worklogs) {
          wlData.worklogs.forEach((wl: any) => {
            const dateStr = wl.started.substring(0, 10);

            if (dateStr >= this.startDate && dateStr <= this.endDate) {
              const authorEmail = wl.author.emailAddress || wl.author.name || wl.author.key;
              const authorDisplayName = wl.author.displayName || wl.author.name;

              // --- لاجیک جدید فیلتر کاربران ---
              const targets = this.targetUsers
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter((t) => t);
              let shouldInclude = true;

              if (targets.length > 0) {
                // بررسی می‌کنیم که آیا ایمیل یا نام این شخص در کلمات وارد شده توسط شما وجود دارد یا خیر
                shouldInclude = targets.some(
                  (t) =>
                    authorEmail?.toLowerCase().includes(t) ||
                    authorDisplayName?.toLowerCase().includes(t),
                );
              }

              // اگر کاربر جزو لیست بود (یا لیستی وارد نکرده بودید)، به گزارش اضافه می‌شود
              if (shouldInclude) {
                extractedWorklogs.push({
                  author: {
                    displayName: authorDisplayName,
                    emailAddress: authorEmail,
                  },
                  timeSpentSeconds: wl.timeSpentSeconds,
                  comment: wl.comment || '',
                  started: wl.started,
                  issueId: issue.key,
                });
              }
            }
          });
        }
      } catch (err) {
        console.warn(`خطا در دریافت جزئیات لاگ برای تسک ${issue.key}`, err);
      }
    });

    await Promise.all(fetchWorklogsPromises);
    return extractedWorklogs;
  }

  private processWorklogs(worklogs: Worklog[]): Record<string, UserReport> {
    const report: Record<string, UserReport> = {};

    worklogs.forEach((log) => {
      const userId = log.author.emailAddress;

      if (!report[userId]) {
        report[userId] = {
          displayName: log.author.displayName,
          totalTimeSeconds: 0,
          categories: { dev: 0, test: 0, review: 0, untagged: 0 },
          activeDays: {},
          issuesCount: new Set<string>(),
          // مقداردهی اولیه آرایه‌ها
          logsByCategory: { dev: [], test: [], review: [], untagged: [] },
          logsByDate: {},
        };
      }

      const userStat = report[userId];
      userStat.totalTimeSeconds += log.timeSpentSeconds;
      userStat.issuesCount.add(log.issueId);

      let commentText = '';
      if (typeof log.comment === 'string') {
        commentText = log.comment.toLowerCase();
      } else if (log.comment && log.comment.content) {
        commentText = JSON.stringify(log.comment).toLowerCase();
      }

      // -- پردازش تگ‌ها و ذخیره لاگ مربوطه --
      let isTagged = false;
      for (const kw of this.KEYWORDS) {
        if (commentText.includes(kw)) {
          userStat.categories[kw as keyof CategoryStats] += log.timeSpentSeconds;
          userStat.logsByCategory[kw].push(log); // ذخیره لاگ
          isTagged = true;
          break;
        }
      }

      if (!isTagged) {
        userStat.categories.untagged += log.timeSpentSeconds;
        userStat.logsByCategory['untagged'].push(log); // ذخیره لاگ
      }

      // -- پردازش روزها و ذخیره لاگ مربوطه --
      const dateKey = log.started.split('T')[0];
      if (!userStat.activeDays[dateKey]) {
        userStat.activeDays[dateKey] = 0;
        userStat.logsByDate[dateKey] = [];
      }
      userStat.activeDays[dateKey] += log.timeSpentSeconds;
      userStat.logsByDate[dateKey].push(log); // ذخیره لاگ
    });

    return report;
  }

  // -- متدهای جدید برای مدیریت مودال --
  openDetailModal(title: string, logs: Worklog[]) {
    // جلوگیری از باز شدن مودال اگر لاگی وجود ندارد
    if (logs && logs.length > 0) {
      this.selectedDetail.set({ title, logs });
    }
  }

  closeDetailModal() {
    this.selectedDetail.set(null);
  }

  // متد استخراج کامنت به صورت رشته برای نمایش در مودال
  getCommentString(comment: string | { content: any[] }): string {
    if (typeof comment === 'string') return comment;
    return 'کامنت دارای فرمت پیچیده (ADF) است.';
  }

  toggleExpand(userKey: string) {
    this.expandedUsers.update((state) => ({
      ...state,
      [userKey]: !state[userKey],
    }));
  }

  getObjectKeysLength(obj: any): number {
    return Object.keys(obj || {}).length;
  }

  toggleTheme() {
    this.isDarkMode.update((val) => !val);
    if (this.isDarkMode()) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}
