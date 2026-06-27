import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'toTime',
})
export class ToTimePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (!value || value <= 0) return '۰ دقیقه';

    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);

    if (hours === 0 && minutes === 0) return '۰ دقیقه';

    const parts: string[] = [];

    if (hours > 0) {
      parts.push(`${hours} ساعت`);
    }

    if (minutes > 0) {
      parts.push(`${minutes} دقیقه`);
    }

    return parts.join(' و ');
  }
}
