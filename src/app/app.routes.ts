import { Routes } from '@angular/router';
import { RahkaranReporter } from './rahkaran-reporter/rahkaran-reporter';
import { JiraDashboard } from './jira-dashboard/jira-dashboard';

export const routes: Routes = [
  {
    path: '',
    component: RahkaranReporter,
  },
  {
    path: 'jira',
    component: JiraDashboard,
  },
];
