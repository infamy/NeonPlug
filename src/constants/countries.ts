// Countries organized by region
export interface CountryRegion {
  name: string;
  countries: string[];
}

export const COUNTRIES_BY_REGION: CountryRegion[] = [
  {
    name: 'North America',
    countries: ['United States', 'Canada', 'Mexico'],
  },
  {
    name: 'Central & South America',
    countries: [
      'Brazil', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Venezuela',
      'Ecuador', 'Guatemala', 'Cuba', 'Costa Rica', 'Panama', 'Uruguay',
      'Paraguay', 'Bolivia',
    ],
  },
  {
    name: 'Europe - Western',
    countries: [
      'United Kingdom', 'Germany', 'France', 'Italy', 'Spain', 'Netherlands',
      'Belgium', 'Switzerland', 'Austria', 'Portugal', 'Ireland', 'Greece',
      'Luxembourg',
    ],
  },
  {
    name: 'Europe - Northern',
    countries: [
      'Sweden', 'Norway', 'Denmark', 'Finland', 'Iceland', 'Estonia',
      'Latvia', 'Lithuania',
    ],
  },
  {
    name: 'Europe - Eastern',
    countries: [
      'Poland', 'Czech Republic', 'Hungary', 'Romania', 'Bulgaria', 'Serbia',
      'Croatia', 'Slovenia', 'Slovakia', 'Ukraine', 'Belarus', 'Moldova',
      'Bosnia and Herzegovina', 'North Macedonia', 'Albania', 'Montenegro',
    ],
  },
  {
    name: 'Asia - East',
    countries: [
      'Japan', 'China', 'South Korea', 'Taiwan', 'Hong Kong', 'Mongolia',
      'Macau',
    ],
  },
  {
    name: 'Asia - Southeast',
    countries: [
      'Thailand', 'Singapore', 'Malaysia', 'Philippines', 'Indonesia',
      'Vietnam', 'Myanmar', 'Cambodia', 'Laos', 'Brunei',
    ],
  },
  {
    name: 'Asia - South',
    countries: [
      'India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Afghanistan',
      'Bhutan', 'Maldives',
    ],
  },
  {
    name: 'Middle East',
    countries: [
      'Turkey', 'Israel', 'United Arab Emirates', 'Saudi Arabia', 'Jordan',
      'Lebanon', 'Kuwait', 'Qatar', 'Bahrain', 'Oman', 'Iraq', 'Iran',
      'Yemen', 'Syria', 'Palestine',
    ],
  },
  {
    name: 'Africa',
    countries: [
      'South Africa', 'Egypt', 'Nigeria', 'Kenya', 'Morocco', 'Tunisia',
      'Ghana', 'Tanzania', 'Uganda', 'Algeria', 'Ethiopia', 'Zimbabwe',
      'Botswana', 'Namibia', 'Zambia', 'Mozambique', 'Angola', 'Libya',
      'Sudan', 'Cameroon', 'Ivory Coast', 'Senegal', 'Rwanda', 'Malawi',
    ],
  },
  {
    name: 'Oceania',
    countries: [
      'Australia', 'New Zealand', 'Papua New Guinea', 'Fiji', 'Samoa',
      'Vanuatu', 'Solomon Islands', 'Tonga', 'New Caledonia',
    ],
  },
  {
    name: 'Russia & Former Soviet',
    countries: [
      'Russia', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan',
      'Tajikistan', 'Armenia', 'Azerbaijan', 'Georgia',
    ],
  },
];
